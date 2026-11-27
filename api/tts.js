import { allow, synthesizeFree } from '../server/tts.js';

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (first ?? '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.searchParams.get('ping')) {
    res.status(200).json({ free: true });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'طريقة غير مدعومة' });
    return;
  }

  let text = url.searchParams.get('text') ?? '';
  let lang = url.searchParams.get('lang') ?? 'ar';
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
    text = body.text ?? text;
    lang = body.lang ?? lang;
  }

  if (!allow(clientIp(req))) {
    res.setHeader('Retry-After', '600');
    res.status(429).json({ error: 'طلبات صوت كثيرة — انتظر عشر دقائق ثم أعد المحاولة' });
    return;
  }

  try {
    const { buffer, contentType } = await synthesizeFree(text, lang);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).send(buffer);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'تعذّر توليد الصوت' });
  }
}
