import { describe, expect, it } from 'vitest';
import { MAX_TEXT, allow, chunkText, resetLimits, synthesizeFree } from '../server/tts.js';

const audio = (bytes = 1024) =>
  new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': 'audio/mpeg' } });

describe('chunkText', () => {
  it('never cuts a chunk past the limit and keeps every character', () => {
    const text = 'هذه جملة عربية طويلة بعض الشيء، ونكررها عدة مرات. '.repeat(8);
    const chunks = chunkText(text, 60);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(60);
    expect(chunks.join(' ').replace(/\s+/g, '')).toBe(text.replace(/\s+/g, '').trim());
  });

  it('returns an empty list for blank text', () => {
    expect(chunkText('   ')).toEqual([]);
  });
});

describe('synthesizeFree', () => {
  it('fetches every chunk and joins the MP3 pieces in order', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      return audio(700);
    };
    const text = 'جملة أولى قصيرة. '.repeat(20);
    const { buffer, contentType } = await synthesizeFree(text, 'ar', fetchImpl);
    expect(contentType).toBe('audio/mpeg');
    expect(buffer.length).toBe(700 * calls.length);
    expect(calls.length).toBeGreaterThan(1);
    expect(calls[0]).toContain('translate_tts');
    expect(calls[0]).toContain('tl=ar');
  });

  it('refuses text longer than the cap and non-audio answers', async () => {
    await expect(synthesizeFree('ا'.repeat(MAX_TEXT + 1))).rejects.toThrow(/أطول/);
    const html = async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } });
    await expect(synthesizeFree('نص', 'ar', html)).rejects.toThrow(/رفض/);
  });
});

describe('allow', () => {
  it('caps calls per address inside the window', () => {
    resetLimits();
    for (let i = 0; i < 40; i += 1) expect(allow('1.2.3.4', 1000)).toBe(true);
    expect(allow('1.2.3.4', 1000)).toBe(false);
    expect(allow('1.2.3.4', 1000 + 11 * 60 * 1000)).toBe(true);
  });
});
