import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { getGrokVideo, grokKey, proxyGrokVideo, startGrokVideo } from './server/grok.js';
import { authorize } from './server/guard.js';
import { allow as allowTts, synthesizeFree } from './server/tts.js';

function readJson(req: import('node:http').IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/** نفس واجهة /api/grok-video في الإنتاج (api/grok-video.js)، لكن داخل خادم التطوير. */
function grokDevApi(): Plugin {
  return {
    name: 'grok-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/grok-video', async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const send = (status: number, data: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(data));
        };
        try {
          const verdict = authorize({
            headers: req.headers as Record<string, string>,
            socket: { remoteAddress: req.socket.remoteAddress },
          });
          if (!verdict.ok) {
            if (verdict.retryAfterMs) res.setHeader('Retry-After', String(Math.ceil(verdict.retryAfterMs / 1000)));
            send(verdict.status ?? 403, { error: verdict.error });
            return;
          }
          if (req.method === 'GET' && url.searchParams.get('ping')) {
            send(200, { configured: Boolean(grokKey()) });
            return;
          }
          if (req.method === 'GET' && url.searchParams.get('proxy')) {
            const result = await proxyGrokVideo(url.searchParams.get('proxy') as string);
            if (!result.response) {
              send(result.status, { error: result.error });
              return;
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', result.response.headers.get('content-type') || 'video/mp4');
            res.end(Buffer.from(await result.response.arrayBuffer()));
            return;
          }
          if (req.method === 'GET' && url.searchParams.get('id')) {
            send(200, await getGrokVideo(url.searchParams.get('id') as string));
            return;
          }
          if (req.method === 'POST') {
            const body = await readJson(req);
            send(200, await startGrokVideo(body as { prompt: string }));
            return;
          }
          send(405, { error: 'طريقة غير مدعومة' });
        } catch (err) {
          const error = err as Error & { code?: string };
          const status = error.code === 'NO_KEY' ? 501 : error.code === 'BAD_INPUT' ? 400 : 502;
          send(status, { error: error.message, code: error.code });
        }
      });
    },
  };
}

/** نفس واجهة /api/tts في الإنتاج (api/tts.js)، لكن داخل خادم التطوير. */
function ttsDevApi(): Plugin {
  return {
    name: 'tts-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/tts', async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const send = (status: number, data: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(data));
        };
        try {
          if (req.method === 'GET' && url.searchParams.get('ping')) {
            send(200, { free: true });
            return;
          }
          if (req.method !== 'GET' && req.method !== 'POST') {
            send(405, { error: 'طريقة غير مدعومة' });
            return;
          }
          if (!allowTts(req.socket.remoteAddress ?? 'unknown')) {
            res.setHeader('Retry-After', '600');
            send(429, { error: 'طلبات صوت كثيرة — انتظر عشر دقائق ثم أعد المحاولة' });
            return;
          }
          let text = url.searchParams.get('text') ?? '';
          let lang = url.searchParams.get('lang') ?? 'ar';
          if (req.method === 'POST') {
            const body = await readJson(req);
            text = (body.text as string) ?? text;
            lang = (body.lang as string) ?? lang;
          }
          const { buffer, contentType } = await synthesizeFree(text, lang);
          res.statusCode = 200;
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.end(buffer);
        } catch (err) {
          send(502, { error: err instanceof Error ? err.message : 'تعذّر توليد الصوت' });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), grokDevApi(), ttsDevApi()],
  server: { host: true, allowedHosts: true, port: 3000 },
  preview: { host: true, allowedHosts: true, port: 3000 },
  build: { target: 'es2022' },
});
