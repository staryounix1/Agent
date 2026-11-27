/**
 * احترام حدود الخدمات المجانية: بدل نوم ثابت، نحسب الوقت المتبقي حتى يُسمح بنداء جديد،
 * ونقرأ «Retry after» من رد 402/429 كما يرسله المزوّد.
 */

export interface RateSlot {
  /** آخر لحظة سُمح فيها بنداء (ms منذ epoch). */
  lastAt: number;
  /** أقل فاصل مسموح بين نداءين. */
  gapMs: number;
}

export function newSlot(gapMs: number): RateSlot {
  return { lastAt: -gapMs, gapMs };
}

/** كم ننتظر قبل النداء القادم عند لحظة now. */
export function waitMs(slot: RateSlot, now: number): number {
  const next = slot.lastAt + slot.gapMs;
  return Math.max(0, next - now);
}

export function afterSuccess(slot: RateSlot, now: number): RateSlot {
  return { ...slot, lastAt: now };
}

/** بعد 402/429 نؤجل حسب ما طلبه المزوّد بدل الفاصل الافتراضي. */
export function afterLimited(slot: RateSlot, now: number, retryAfterMs: number): RateSlot {
  return { ...slot, lastAt: now + Math.max(0, retryAfterMs) - slot.gapMs };
}

/** يقرأ «Retry after 30s» أو ترويسة retry-after بالثواني. يعيد null إن لم يجد شيئًا. */
export function readRetryAfter(value: string | number | null | undefined, unit: string | null = 's'): number | null {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value);
  const match = text.match(/(?:retry[\s_-]*after|عاود بعد)\D{0,12}(\d+(?:[.,]\d+)?)\s*(ms|ثانية|ثوان|s)?/i);
  if (match) {
    const amount = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(amount)) return null;
    const suffix = match[2] ?? '';
    return /ms/i.test(suffix) ? amount : amount * 1000;
  }
  const plain = Number(text);
  if (Number.isFinite(plain) && plain >= 0) return unit === 'ms' ? plain : plain * 1000;
  return null;
}

/** يستخرج الثواني المنتظرة من نص خطأ جاهز (رسالة المزوّد) مع سقف معقول. */
export function retryAfterFromMessage(message: string, capMs = 120_000): number | null {
  const found = readRetryAfter(message);
  if (found === null) return null;
  return Math.min(capMs, Math.max(0, found));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
