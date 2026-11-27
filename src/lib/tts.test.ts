import { describe, expect, it } from 'vitest';
import type { Provider } from './providers';
import { pcmToWav, speechSupported, synthesizeSpeech } from './tts';

function provider(over: Partial<Provider>): Provider {
  return {
    id: 'p',
    label: 'مزوّد',
    stage: 'voice',
    kind: 'elevenlabs',
    baseUrl: 'https://api.elevenlabs.io/v1',
    model: 'eleven_multilingual_v2',
    key: 'sk-test',
    builtin: false,
    ...over,
  } as Provider;
}

type Call = { url: string; init: RequestInit };

function recorder(response: () => Response): { calls: Call[]; fetchImpl: (url: string, init?: RequestInit) => Promise<Response> } {
  const calls: Call[] = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init: init ?? {} });
      return response();
    },
  };
}

const mp3 = () => new Response(new Uint8Array(2048), { status: 200, headers: { 'content-type': 'audio/mpeg' } });

describe('speechSupported', () => {
  it('knows which provider kinds can speak', () => {
    expect(speechSupported(provider({ kind: 'elevenlabs' }))).toBe(true);
    expect(speechSupported(provider({ kind: 'google' }))).toBe(true);
    expect(speechSupported(provider({ kind: 'openai' }))).toBe(true);
    expect(speechSupported(provider({ kind: 'custom' }))).toBe(true);
    expect(speechSupported(provider({ kind: 'free-voice' }))).toBe(true);
    expect(speechSupported(provider({ kind: 'pollinations' }))).toBe(false);
    expect(speechSupported(provider({ kind: 'local' }))).toBe(false);
  });
});

describe('synthesizeSpeech', () => {
  it('calls ElevenLabs with the key, voice and model and returns the audio blob', async () => {
    const { calls, fetchImpl } = recorder(mp3);
    const blob = await synthesizeSpeech(provider({}), 'مرحبا بكم', 'ar', { fetchImpl, voice: 'voice-1' });
    expect(blob.type).toBe('audio/mpeg');
    expect(blob.size).toBe(2048);
    expect(calls[0].url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice-1?output_format=mp3_44100_128');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['xi-api-key']).toBe('sk-test');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ text: 'مرحبا بكم', model_id: 'eleven_multilingual_v2' });
  });

  it('calls an OpenAI-compatible voice endpoint for openai/custom providers', async () => {
    const { calls, fetchImpl } = recorder(mp3);
    await synthesizeSpeech(provider({ kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'tts-1' }), 'hello', 'en', { fetchImpl });
    expect(calls[0].url).toBe('https://api.openai.com/v1/audio/speech');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({ model: 'tts-1', input: 'hello', response_format: 'mp3' });
  });

  it('uses the free Google voice proxy with no key', async () => {
    const { calls, fetchImpl } = recorder(() => new Response(new Uint8Array(4096), { headers: { 'content-type': 'audio/mpeg' } }));
    const blob = await synthesizeSpeech(
      provider({ kind: 'free-voice', baseUrl: '', model: '', key: '' }),
      'فكرة سريعة',
      'ar',
      { fetchImpl },
    );
    expect(blob.size).toBe(4096);
    expect(calls[0].url).toContain('/api/tts?');
    expect(calls[0].url).toContain('lang=ar');
    expect(calls[0].url).toContain(encodeURIComponent('فكرة سريعة'));
    expect(calls[0].init.method).toBe('GET');
  });

  it('wraps Google PCM audio into a playable WAV', async () => {
    const pcm = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
    const { calls, fetchImpl } = recorder(
      () =>
        new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ inlineData: { data: btoa(String.fromCharCode(...pcm)), mimeType: 'audio/L16;codec=pcm;rate=24000' } }] } },
            ],
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    );
    const blob = await synthesizeSpeech(provider({ kind: 'google', baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-2.5-flash-preview-tts' }), 'نص', 'ar', { fetchImpl });
    expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent');
    expect((calls[0].init.headers as Record<string, string>)['x-goog-api-key']).toBe('sk-test');
    expect(blob.type).toBe('audio/wav');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes.length).toBe(44 + pcm.length);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF');
  });

  it('fails with the provider message on a rejected request', async () => {
    const { fetchImpl } = recorder(
      () => new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), { status: 401 }),
    );
    await expect(synthesizeSpeech(provider({ kind: 'openai', baseUrl: 'https://api.openai.com/v1' }), 'x', 'ar', { fetchImpl })).rejects.toThrow(
      /HTTP 401.*Incorrect API key/,
    );
  });

  it('rejects empty text, a missing key and a non-audio response', async () => {
    await expect(synthesizeSpeech(provider({}), '   ', 'ar', { fetchImpl: recorder(mp3).fetchImpl })).rejects.toThrow(/فارغ/);
    await expect(synthesizeSpeech(provider({ key: '' }), 'نص', 'ar', { fetchImpl: recorder(mp3).fetchImpl })).rejects.toThrow(/مفتاح/);
    const html = recorder(() => new Response(new Uint8Array(4096), { headers: { 'content-type': 'text/html' } }));
    await expect(synthesizeSpeech(provider({ kind: 'openai' }), 'نص', 'ar', { fetchImpl: html.fetchImpl })).rejects.toThrow(/ليس صوتًا/);
  });

  it('does not hand back a tiny empty blob as success', async () => {
    const tiny = recorder(() => new Response(new Uint8Array(10), { headers: { 'content-type': 'audio/mpeg' } }));
    await expect(synthesizeSpeech(provider({ kind: 'openai' }), 'نص', 'ar', { fetchImpl: tiny.fetchImpl })).rejects.toThrow(/فارغًا/);
  });
});

describe('pcmToWav', () => {
  it('writes a valid header with the data size in it', async () => {
    const blob = pcmToWav(new Uint8Array(2000), 16_000, 2, 16);
    const view = new DataView(await blob.arrayBuffer());
    expect(new TextDecoder().decode(new Uint8Array(view.buffer, 0, 4))).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + 2000);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(40, true)).toBe(2000);
  });
});
