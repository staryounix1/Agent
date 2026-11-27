/**
 * إبقاء الشاشة مضاءة أثناء التسجيل، وتنبيه إذا خرج المستخدم من الصفحة:
 * خروج الصفحة يوقف إطارات canvas ويترك التسجيل ينتج فيديو مجمّدًا.
 */

export function wakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator && Boolean(navigator.wakeLock);
}

/** يحاول إمساك قفل الشاشة ويعيد دالة تحرير آمنة (لا ترمي أبدًا). */
export async function keepAwake(): Promise<() => void> {
  const release = () => {
    /* لا شيء */
  };
  if (!wakeLockSupported()) return release;
  try {
    const sentinel = await navigator.wakeLock.request('screen');
    let released = false;
    const letGo = () => {
      if (released) return;
      released = true;
      void sentinel.release().catch(() => undefined);
    };
    sentinel.addEventListener('release', () => {
      released = true;
    });
    return letGo;
  } catch {
    return release;
  }
}

/** ينادي onHidden مرة واحدة فقط عند أول إخفاء للصفحة، ويعيد دالة الإلغاء. */
export function watchVisibility(onHidden: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  let fired = false;
  const handler = () => {
    if (document.visibilityState === 'hidden' && !fired) {
      fired = true;
      onHidden();
    }
  };
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
