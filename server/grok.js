const API = 'https://api.x.ai/v1';

export function grokKey() {
  return process.env.XAI_API_KEY || process.env.GROK_API_KEY || '';
}

export const GROK_MODELS = ['grok-imagine-video-1.5-lite', 'grok-imagine-video-1.5'];

function normalizeStatus(data) {
  const status = String(data?.status ?? '').toLowerCase();
  const url = data?.video?.url || data?.url || null;
  if (url) return 'done';
  if (status === 'failed' || status === 'error' || status === 'expired') return 'failed';
  if (status === 'done' || status === 'completed' || status === 'succeeded') return 'done';
  return 'pending';
}

async function call(path, { method = 'GET', body } = {}) {
  const key = grokKey();
  if (!key) {
    const error = new Error('NO_KEY');
    error.code = 'NO_KEY';
    throw error;
  }
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(data?.error?.message || data?.error || `xAI ${response.status}`);
    error.status = response.status;
    error.code = 'UPSTREAM';
    throw error;
  }
  return data;
}

export async function startGrokVideo({ prompt, duration = 6, aspect = '9:16', model = GROK_MODELS[0] }) {
  const safePrompt = String(prompt ?? '').trim().slice(0, 2000);
  if (!safePrompt) {
    const error = new Error('الوصف مطلوب');
    error.code = 'BAD_INPUT';
    throw error;
  }
  const seconds = [6, 10, 15].includes(Number(duration)) ? Number(duration) : 6;
  const base = { model: GROK_MODELS.includes(model) ? model : GROK_MODELS[0], prompt: safePrompt, duration: seconds };
  const full = { ...base, aspect_ratio: aspect };
  let data;
  try {
    data = await call('/videos/generations', { method: 'POST', body: full });
  } catch (err) {
    if (err.status === 400) {
      data = await call('/videos/generations', { method: 'POST', body: base });
    } else {
      throw err;
    }
  }
  const requestId = data?.request_id || data?.id;
  if (!requestId) {
    const error = new Error('لم يعد xAI بمعرّف الطلب');
    error.code = 'UPSTREAM';
    throw error;
  }
  return { requestId, model: base.model, duration: seconds };
}

export async function getGrokVideo(requestId) {
  const data = await call(`/videos/${encodeURIComponent(String(requestId))}`);
  return {
    status: normalizeStatus(data),
    url: data?.video?.url || data?.url || null,
    progress: data?.progress ?? null,
    error: data?.error?.message || null,
  };
}

export async function proxyGrokVideo(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { status: 400, error: 'رابط غير صالح' };
  }
  if (!/(^|\.)x\.ai$/i.test(parsed.hostname) && !/(^|\.)xai\.ai$/i.test(parsed.hostname)) {
    return { status: 400, error: 'نطاق غير مسموح' };
  }
  const response = await fetch(parsed.toString(), { headers: { 'User-Agent': 'mashhad-studio' } });
  if (!response.ok) return { status: response.status, error: 'تعذّر تنزيل الفيديو من xAI' };
  return { status: 200, response };
}
