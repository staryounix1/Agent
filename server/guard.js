/**
 * حماية /api/grok-video: كل نداء يستهلك رصيد مفتاح xAI الموجود على الخادم،
 * فلا يُسمح إلا لصفحة التطبيق نفسها، بمعدّل محدود لكل عنوان IP، ومفتاح مشترك اختياري.
 */

export const WINDOW_MS = 10 * 60 * 1000;
export const MAX_CALLS = 12;

/** حالات العدّ في الذاكرة؛ كافية لدالة serverless دافئة وتُصفَّر تلقائيًا بعد النافذة. */
export const hits = new Map();

export function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

function hostOf(headers) {
  return String(headers['x-forwarded-host'] ?? headers.host ?? '').split(':')[0].toLowerCase();
}

function originHost(origin) {
  try {
    return new URL(origin).host.split(':')[0].toLowerCase();
  } catch {
    return '';
  }
}

export function allowedOrigins(env = process.env) {
  return String(env.APP_ORIGINS ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/** نفس مضيف الطلب (أو مضيف مسجّل في APP_ORIGINS). */
export function originAllowed(origin, host, env = process.env) {
  if (!origin) return false;
  const originHostName = originHost(origin);
  if (!originHostName) return false;
  if (host && originHostName === host) return true;
  return allowedOrigins(env).some((item) => originHost(item) === originHostName);
}

export function checkRate(store, ip, now, options = {}) {
  const max = options.max ?? MAX_CALLS;
  const windowMs = options.windowMs ?? WINDOW_MS;
  const recent = (store.get(ip) ?? []).filter((at) => now - at < windowMs);
  if (recent.length >= max) {
    const retryAfterMs = Math.max(1000, windowMs - (now - recent[0]));
    store.set(ip, recent);
    return { allowed: false, retryAfterMs, remaining: 0 };
  }
  recent.push(now);
  store.set(ip, recent);
  return { allowed: true, retryAfterMs: 0, remaining: max - recent.length };
}

/**
 * قرار واحد لكل طلب: { ok } أو { ok:false, status, error, retryAfterMs }.
 * - طلب متصفح: يجب أن يكون من نفس المضيف أو من APP_ORIGINS.
 * - طلب بلا Origin (سكربت/curl): يجب أن يحمل x-app-key المطابق لـ APP_SHARED_KEY.
 */
export function authorize(req, env = process.env, now = Date.now(), store = hits) {
  const headers = req.headers ?? {};
  const origin = String(headers.origin ?? '').trim();
  const host = hostOf(headers);
  const sharedKey = String(env.APP_SHARED_KEY ?? '').trim();
  const givenKey = String(headers['x-app-key'] ?? '').trim();

  if (origin) {
    if (!originAllowed(origin, host, env))
      return { ok: false, status: 403, error: 'هذا المصدر غير مسموح باستعمال الخدمة' };
  } else if (!sharedKey || givenKey !== sharedKey) {
    return { ok: false, status: 403, error: 'هذه الخدمة للتطبيق فقط — الطلب بلا مصدر معروف' };
  }

  if (sharedKey && givenKey !== sharedKey)
    return { ok: false, status: 403, error: 'مفتاح التطبيق غير صحيح' };

  const rate = checkRate(store, clientIp(req), now);
  if (!rate.allowed) {
    return {
      ok: false,
      status: 429,
      error: `طلبات كثيرة — جرّب بعد ${Math.ceil(rate.retryAfterMs / 1000)} ثانية`,
      retryAfterMs: rate.retryAfterMs,
    };
  }

  return { ok: true, remaining: rate.remaining };
}
