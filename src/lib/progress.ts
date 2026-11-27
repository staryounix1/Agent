export type ProduceStage = 'images' | 'voice' | 'render';

export interface StageSpec {
  id: ProduceStage;
  label: string;
  weight: number;
}

/** أوزان المراحل: الصور أثقل خطوة، ثم الصوت، ثم التصدير. مجموعها 1. */
export const PRODUCE_STAGES: StageSpec[] = [
  { id: 'images', label: 'نجيب صور المشاهد', weight: 0.55 },
  { id: 'voice', label: 'نسجّل التعليق الصوتي', weight: 0.2 },
  { id: 'render', label: 'نصدّر الفيديو', weight: 0.25 },
];

export interface StageProgress {
  stage: ProduceStage;
  done: number;
  total: number;
  note?: string;
}

export function stageSpec(stage: ProduceStage): StageSpec {
  return PRODUCE_STAGES.find((item) => item.id === stage) ?? PRODUCE_STAGES[0];
}

/** «نجيب صور المشاهد ٢/٥» أو «نصدّر الفيديو ٤٠٪». */
export function stageLabel(progress: StageProgress): string {
  const spec = stageSpec(progress.stage);
  if (progress.total > 1) return `${spec.label} ${progress.done}/${progress.total}`;
  if (progress.stage === 'render') return `${spec.label} ${Math.round(clamp01(progress.done) * 100)}٪`;
  return spec.label;
}

/** نسبة واحدة 0..1 تجمع المراحل المنجزة داخل مرحلتها الحالية. */
export function overallRatio(progress: StageProgress): number {
  let before = 0;
  for (const spec of PRODUCE_STAGES) {
    if (spec.id === progress.stage) {
      const within = progress.total > 0 ? clamp01(progress.done / progress.total) : 0;
      return clamp01(before + spec.weight * within);
    }
    before += spec.weight;
  }
  return 1;
}

/** أول مرحلة ناقصة — تُستعمل عند إعادة المحاولة لتخطي ما تم. */
export function firstOpenStage(done: Partial<Record<ProduceStage, boolean>>): ProduceStage | null {
  for (const spec of PRODUCE_STAGES) if (!done[spec.id]) return spec.id;
  return null;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
