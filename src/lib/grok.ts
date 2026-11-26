const ENDPOINT = '/api/grok-video';

export interface GrokStartInput {
  prompt: string;
  duration?: number;
  aspect?: string;
  model?: string;
}

export type GrokPhase = 'starting' | 'queued' | 'rendering' | 'downloading';

export async function grokConfigured(): Promise<boolean> {
  try {
    const response = await fetch(`${ENDPOINT}?ping=1`);
    if (!response.ok) return false;
    const data = (await response.json()) as { configured?: boolean };
    return Boolean(data.configured);
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** يولّد مقطعًا عبر xAI ويُنزّله عبر خادمنا (المفتاح يبقى في الخادم). */
export async function generateGrokVideo(
  input: GrokStartInput,
  onPhase: (phase: GrokPhase, progress: number) => void,
): Promise<Blob> {
  onPhase('starting', 0.02);
  const start = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const started = (await start.json()) as { requestId?: string; error?: string; code?: string };
  if (!start.ok || !started.requestId) {
    throw new Error(
      started.code === 'NO_KEY'
        ? 'التوليد المباشر يحتاج مفتاح XAI_API_KEY في إعدادات النشر. يمكنك توليد المقطع في تطبيق Grok ثم استيراده.'
        : started.error || 'تعذّر بدء التوليد',
    );
  }

  for (let attempt = 0; attempt < 90; attempt += 1) {
    await sleep(attempt === 0 ? 2500 : 4000);
    const response = await fetch(`${ENDPOINT}?id=${encodeURIComponent(started.requestId)}`);
    const data = (await response.json()) as { status?: string; url?: string | null; error?: string; progress?: number };
    if (!response.ok) throw new Error(data.error || 'تعذّر متابعة حالة التوليد');
    if (data.status === 'failed') throw new Error(data.error || 'فشل التوليد عند xAI');
    const ratio = typeof data.progress === 'number' ? data.progress / 100 : Math.min(0.9, 0.1 + attempt * 0.03);
    if (data.status === 'done' && data.url) {
      onPhase('downloading', 0.94);
      const video = await fetch(`${ENDPOINT}?proxy=${encodeURIComponent(data.url)}`);
      if (!video.ok) throw new Error('تعذّر تنزيل الفيديو من xAI');
      const blob = await video.blob();
      onPhase('downloading', 1);
      return blob;
    }
    onPhase('rendering', ratio);
  }
  throw new Error('تجاوزنا وقت الانتظار — جرّب مقطعًا أقصر أو أعد المحاولة.');
}

export function grokPromptFromScene(visual: string, text: string): string {
  const parts = [visual, text].map((part) => part.trim()).filter(Boolean);
  const base = parts.join('. ').slice(0, 700);
  return `${base}. Cinematic vertical shot, warm natural light, shallow depth of field, no on-screen text.`;
}
