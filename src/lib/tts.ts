import type { Lang } from '../types';
import type { Provider } from './providers';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const VOICE_STAGE_GAP = 30_000;

/** مزوّدو التعليق الصوتي: ElevenLabs، Google TTS، أي واجهة متوافقة مع OpenAI، وصوت Google المجاني بلا مفتاح. */
export function speechSupported(provider: Provider): boolean {
  return (
    provider.kind === 'elevenlabs' ||
    provider.kind === 'google' ||
    provider.kind === 'openai' ||
    provider.kind === 'custom' ||
    provider.kind === 'free-voice'
  );
}

/** أسماء أصوات معقولة لكل مزوّد، بحسب اللغة. */
export function defaultVoice(provider: Provider, lang: Lang): string {
  if (provider.kind === 'google') return lang === 'ar' ? 'Kore' : lang === 'fr' ? 'Charon' : 'Puck';
  if (provider.kind === 'free-voice') return lang === 'ar' ? 'ar' : lang === 'fr' ? 'fr' : 'en';
  return 'alloy';
}

/** بروكسي الصوت المجاني: نفس الأصل على الويب، أو خادم منشور عبر VITE_API_BASE. */
export function apiBase(): string {
  const configured = (import.meta.env.VITE_API_BASE as string | undefined)?.trim().replace(/\/+$/, '');
  return configured || '';
}

function isNativeApp(): boolean {
  return typeof window !== 'undefined' && /^(capacitor|ionic|file):$/.test(window.location.protocol);
}

function splitText(text: string, size = 170): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  const parts: string[] = [];
  let rest = clean;
  while (rest.length > size) {
    const window = rest.slice(0, size + 1);
    const cut = Math.max(
      window.lastIndexOf('،'),
      window.lastIndexOf('.'),
      window.lastIndexOf('!'),
      window.lastIndexOf('؟'),
      window.lastIndexOf(' '),
    );
    const at = cut > size * 0.4 ? cut + 1 : size;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts.filter(Boolean);
}

/**
 * داخل نسخة APK لا يوجد خادم يقدّم /api/tts، وGoogle لا يرسل ترويسات CORS،
 * فنمرّ عبر CapacitorHttp الذي يتجاوز CORS أصلًا.
 */
async function freeVoiceNative(text: string, lang: Lang): Promise<Blob> {
  const { CapacitorHttp } = await import('@capacitor/core');
  const pieces: BlobPart[] = [];
  for (const chunk of splitText(text)) {
    const url =
      'https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&ttsspeed=1' +
      `&tl=${lang}&q=${encodeURIComponent(chunk)}`;
    const result = await CapacitorHttp.get({
      url,
      responseType: 'blob',
      headers: { Referer: 'https://translate.google.com/' },
    });
    if (result.status < 200 || result.status >= 300)
      throw new Error(`الصوت المجاني رفض الطلب (HTTP ${result.status})`);
    const data = result.data as unknown;
    if (typeof data === 'string') pieces.push(base64ToBytes(data));
    else if (data instanceof Blob) pieces.push(data);
    else throw new Error('الصوت المجاني رجع صيغة غير مفهومة');
  }
  const blob = new Blob(pieces, { type: 'audio/mpeg' });
  if (blob.size < 512) throw new Error('الصوت المجاني رجع ملفًا فارغًا');
  return blob;
}

function baseOf(provider: Provider): string {
  let base = provider.baseUrl.trim().replace(/\/+$/, '');
  if (provider.kind === 'google') {
    base = base.replace(/\/v1beta\/?.*$/, '').replace(/\/openai$/, '');
    return base || 'https://generativelanguage.googleapis.com';
  }
  return base.replace(/\/(text-to-speech|audio\/speech)\/?.*$/, '');
}

function keyOf(provider: Provider): string {
  const key = provider.key.trim().replace(/^["']|["']$/g, '');
  if (!key) throw new Error('مفتاح مزوّد الصوت خالي — لصقه في الإعدادات أولًا.');
  return key;
}

function authHeaders(provider: Provider): Record<string, string> {
  const key = keyOf(provider);
  if (provider.kind === 'google') return { 'x-goog-api-key': key };
  if (provider.kind === 'elevenlabs') return { 'xi-api-key': key };
  return { Authorization: `Bearer ${key}` };
}

async function detailOf(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  try {
    const body = JSON.parse(text) as { error?: { message?: string } | string; message?: string; detail?: string | { message?: string } };
    if (typeof body.error === 'string') return body.error;
    if (body.error?.message) return body.error.message;
    if (typeof body.detail === 'string') return body.detail;
    if (body.detail?.message) return body.detail.message;
    return body.message ?? text;
  } catch {
    return text;
  }
}

export function pcmToWav(pcm: Uint8Array<ArrayBuffer>, sampleRate = 24_000, channels = 1, bitsPerSample = 16): Blob {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  write(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  write(36, 'data');
  view.setUint32(40, pcm.length, true);
  return new Blob([header, pcm], { type: 'audio/wav' });
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

interface SpeechRequest {
  url: string;
  init: RequestInit;
  timeoutMs: number;
}

function requestFor(provider: Provider, text: string, lang: Lang, voice?: string): SpeechRequest {
  const base = baseOf(provider);
  const model = provider.model.trim();
  const chosen = voice?.trim() || defaultVoice(provider, lang);

  if (provider.kind === 'free-voice') {
    const url = `${apiBase()}/api/tts?lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(text)}`;
    return { url, init: { method: 'GET' }, timeoutMs: 90_000 };
  }

  if (provider.kind === 'elevenlabs') {
    const voiceId = chosen && chosen !== 'alloy' && chosen !== 'nova' ? chosen : '21m00Tcm4TlvDq8ikWAM';
    return {
      url: `${base}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg', ...authHeaders(provider) },
        body: JSON.stringify({ text, model_id: model || 'eleven_multilingual_v2' }),
      },
      timeoutMs: 60_000,
    };
  }

  if (provider.kind === 'google') {
    return {
      url: `${base}/v1beta/models/${encodeURIComponent(model || 'gemini-2.5-flash-preview-tts')}:generateContent`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(provider) },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: chosen } } },
          },
        }),
      },
      timeoutMs: 90_000,
    };
  }

  return {
    url: `${base}/audio/speech`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(provider) },
      body: JSON.stringify({
        model: model || 'tts-1',
        input: text,
        voice: chosen,
        response_format: 'mp3',
      }),
    },
    timeoutMs: 60_000,
  };
}

/** يولّد تعليقًا صوتيًا لمشهد واحد ويعيده Blob جاهزًا للتسجيل والتصدير. */
export async function synthesizeSpeech(
  provider: Provider,
  text: string,
  lang: Lang,
  options: { voice?: string; fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<Blob> {
  if (!speechSupported(provider)) throw new Error('هذا المزوّد لا يدعم الصوت');
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) throw new Error('نص المشهد فارغ — ما فيه ما يُنطق');
  if (provider.kind !== 'free-voice' && !provider.key.trim())
    throw new Error('مفتاح مزوّد الصوت خالي — لصقه في الإعدادات أولًا.');

  if (provider.kind === 'free-voice' && isNativeApp() && !apiBase())
    return freeVoiceNative(clean, lang);

  const { url, init, timeoutMs } = requestFor(provider, clean, lang, options.voice);
  const doFetch: FetchLike = options.fetchImpl ?? ((u, i) => fetch(u, i));
  const controller = new AbortController();
  const limit = options.timeoutMs ?? timeoutMs;
  const timer = setTimeout(() => controller.abort(), limit);
  let response: Response;
  try {
    response = await doFetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw new Error(`مزوّد الصوت ما جاوبش في ${Math.round(limit / 1000)} ثانية — جرّب مشهدًا أقصر أو مزوّدًا آخر.`);
    if (error instanceof TypeError) throw new Error('تعذّر الوصول لمزوّد الصوت: تحقق من الإنترنت.');
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = (await detailOf(response)).replace(/\s+/g, ' ').trim().slice(0, 200);
    throw new Error(`${provider.label} رفض التعليق الصوتي (HTTP ${response.status})${detail ? `: ${detail}` : ''}`);
  }

  if (provider.kind === 'google') {
    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
    };
    const inline = data.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
    if (!inline?.data) throw new Error('Google رجع بلا صوت');
    const mime = inline.mimeType ?? 'audio/L16;rate=24000';
    const bytes = base64ToBytes(inline.data);
    if (/l16|pcm/i.test(mime)) {
      const rate = Number(mime.match(/rate=(\d+)/i)?.[1]) || 24_000;
      return pcmToWav(bytes, rate);
    }
    return new Blob([bytes], { type: mime });
  }

  const blob = await response.blob();
  if (blob.size < 512) throw new Error(`${provider.label} رجع صوتًا فارغًا`);
  const type = blob.type || 'audio/mpeg';
  if (!type.startsWith('audio/') && !type.includes('octet-stream'))
    throw new Error(`${provider.label} رجع ردًّا ليس صوتًا (${type})`);
  return blob.type === type ? blob : new Blob([blob], { type: type.includes('octet-stream') ? 'audio/mpeg' : type });
}

export const VOICE_GAP_MS = VOICE_STAGE_GAP;
