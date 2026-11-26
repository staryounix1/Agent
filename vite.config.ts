import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { getGrokVideo, grokKey, proxyGrokVideo, startGrokVideo } from './server/grok.js';

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

export default defineConfig({
  plugins: [react(), grokDevApi()],
  server: { host: true, allowedHosts: true, port: 3000 },
  preview: { host: true, allowedHosts: true, port: 3000 },
  build: { target: 'es2022' },
});
