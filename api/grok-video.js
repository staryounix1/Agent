import { getGrokVideo, grokKey, proxyGrokVideo, startGrokVideo } from '../server/grok.js';
import { authorize } from '../server/guard.js';

export default async function handler(req, res) {
  const verdict = authorize(req);
  if (!verdict.ok) {
    if (verdict.retryAfterMs) res.setHeader('Retry-After', Math.ceil(verdict.retryAfterMs / 1000));
    res.status(verdict.status).json({ error: verdict.error });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.searchParams.get('ping')) {
    res.status(200).json({ configured: Boolean(grokKey()) });
    return;
  }

  if (req.method === 'GET' && url.searchParams.get('proxy')) {
    const result = await proxyGrokVideo(url.searchParams.get('proxy'));
    if (!result.response) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.setHeader('Content-Type', result.response.headers.get('content-type') || 'video/mp4');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    const buffer = Buffer.from(await result.response.arrayBuffer());
    res.status(200).send(buffer);
    return;
  }

  if (req.method === 'GET' && url.searchParams.get('id')) {
    try {
      res.status(200).json(await getGrokVideo(url.searchParams.get('id')));
    } catch (err) {
      res.status(err.code === 'NO_KEY' ? 501 : 502).json({ error: err.message, code: err.code });
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
      res.status(200).json(await startGrokVideo(body));
    } catch (err) {
      const status = err.code === 'NO_KEY' ? 501 : err.code === 'BAD_INPUT' ? 400 : 502;
      res.status(status).json({ error: err.message, code: err.code });
    }
    return;
  }

  res.status(405).json({ error: 'طريقة غير مدعومة' });
}
