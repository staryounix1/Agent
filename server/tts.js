/**
 * تعليق صوتي مجاني بلا مفتاح: أصوات Google عبر translate_tts.
 * Google يقبل نحو 200 حرف للطلب الواحد ولا يرسل ترويسات CORS،
 * فيمرّ كل الطلب من الخادم: نقسّم النص، نجلب المقاطع، ونلصقها في MP3 واحد.
 */

export const MAX_TEXT = 1200;
export const MAX_CHUNK = 170;
export const WINDOW_MS = 10 * 60 * 1000;
export const MAX_CALLS = 40;

const LANGS = new Set(['ar', 'en', 'fr']);
const hits = new Map();

export function chunkText(text, size = MAX_CHUNK) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const parts = [];
  let rest = clean;
  while (rest.length > size) {
    const window = rest.slice(0, size + 1);
    const cut = Math.max(
      window.lastIndexOf('،'),
      window.lastIndexOf('.'),
      window.lastIndexOf('!'),
      window.lastIndexOf('؟'),
      window.lastIndexOf('?'),
      window.lastIndexOf(','),
      window.lastIndexOf('؛'),
      window.lastIndexOf(';'),
      window.lastIndexOf(' '),
    );
    const at = cut > size * 0.4 ? cut + 1 : size;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts.filter(Boolean);
}

/** حدّ بسيط لكل عنوان، كافٍ لدالة serverless دافئة. */
export function allow(ip, now = Date.now()) {
  const stamp = hits.get(ip);
  if (!stamp || now - stamp.start > WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    return true;
  }
  if (stamp.count >= MAX_CALLS) return false;
  stamp.count += 1;
  return true;
}

export function resetLimits() {
  hits.clear();
}

export async function synthesizeFree(text, lang = 'ar', fetchImpl = fetch) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) throw new Error('النص فارغ — ما فيه ما يُنطق');
  if (clean.length > MAX_TEXT) throw new Error(`النص أطول من ${MAX_TEXT} حرف للطلب الواحد`);
  const tl = LANGS.has(lang) ? lang : 'ar';
  const chunks = chunkText(clean);
  const pieces = [];
  for (const chunk of chunks) {
    const url =
      'https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&ttsspeed=1' +
      `&tl=${tl}&q=${encodeURIComponent(chunk)}`;
    const response = await fetchImpl(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        Referer: 'https://translate.google.com/',
      },
    });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !type.startsWith('audio/')) {
      const detail = await response.text().catch(() => '');
      throw new Error(`الصوت المجاني رفض الطلب (HTTP ${response.status}) ${detail.slice(0, 120)}`.trim());
    }
    pieces.push(Buffer.from(await response.arrayBuffer()));
  }
  const buffer = Buffer.concat(pieces);
  if (buffer.length < 512) throw new Error('الصوت المجاني رجع ملفًا فارغًا');
  return { buffer, contentType: 'audio/mpeg' };
}
