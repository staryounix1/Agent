import type { Lang, Motion, Project, Scene } from '../types';

export interface TimedScene {
  scene: Scene;
  index: number;
  start: number;
  end: number;
  dur: number;
}

export interface Cue {
  sceneIndex: number;
  text: string;
  start: number;
  end: number;
}

export interface Timeline {
  scenes: TimedScene[];
  cues: Cue[];
  duration: number;
  maxChars: number;
}

const WORDS_PER_SECOND: Record<Lang, number> = { ar: 2.3, fr: 2.6, en: 2.6 };
export const MIN_SCENE_SECONDS = 1.6;

export function estimateSeconds(text: string, lang: Lang): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(MIN_SCENE_SECONDS, words / WORDS_PER_SECOND[lang] + 0.35);
}

export function sceneSeconds(scene: Scene, lang: Lang, audioSeconds?: number): number {
  const spoken = Math.max(scene.seconds || estimateSeconds(scene.text, lang), audioSeconds ? audioSeconds + 0.25 : 0);
  return Math.max(MIN_SCENE_SECONDS, Math.round(spoken * 10) / 10);
}

/** عدد الأحرف المناسب لكل سطر ترجمة حسب عرض الإطار وحجم الخط. */
export function charBudget(width: number, fontSize: number): number {
  const usable = width * 0.84;
  return Math.max(14, Math.floor(usable / (fontSize * 0.52)));
}

/** تقسيم نص المشهد إلى لقطات ترجمة قصيرة (سطرين كحد أقصى لكل لقطة). */
export function cueChunks(text: string, maxChars: number): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const sentences = clean.split(/(?<=[.!?؟…:؛])\s+/).filter(Boolean);
  const out: string[] = [];
  let current = '';
  const flush = () => {
    if (current.trim()) out.push(current.trim());
    current = '';
  };

  for (const sentence of sentences) {
    if (sentence.length <= maxChars) {
      if (!current) current = sentence;
      else if (current.length + 1 + sentence.length <= maxChars) current += ` ${sentence}`;
      else {
        flush();
        current = sentence;
      }
      continue;
    }
    flush();
    let line = '';
    for (const word of sentence.split(' ')) {
      if (!line) line = word;
      else if (line.length + 1 + word.length <= maxChars) line += ` ${word}`;
      else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  flush();
  return out.length ? out : [clean];
}

export function buildTimeline(
  project: Pick<Project, 'lang' | 'scenes'> & { captions?: { size: number } },
  audioDurations: Record<string, number> = {},
  width = 1080,
): Timeline {
  const scenes: TimedScene[] = [];
  let cursor = 0;
  for (let i = 0; i < project.scenes.length; i += 1) {
    const scene = project.scenes[i];
    const dur = sceneSeconds(scene, project.lang, audioDurations[scene.id] ?? scene.audioSeconds);
    scenes.push({ scene, index: i, start: cursor, end: cursor + dur, dur });
    cursor += dur;
  }
  const duration = cursor;
  const fontSize = Math.round(width * 0.05 * (project.captions?.size ?? 1));
  const maxChars = charBudget(width, fontSize) * 2;

  const cues: Cue[] = [];
  for (const timed of scenes) {
    const chunks = cueChunks(timed.scene.text, maxChars);
    if (!chunks.length) continue;
    const totalChars = chunks.reduce((sum, chunk) => sum + chunk.length, 0) || 1;
    let at = timed.start;
    for (const chunk of chunks) {
      const share = (chunk.length / totalChars) * timed.dur;
      cues.push({ sceneIndex: timed.index, text: chunk, start: at, end: Math.min(timed.end, at + share) });
      at += share;
    }
  }
  return { scenes, cues, duration, maxChars };
}

export function sceneAt(timeline: Timeline, t: number): TimedScene | null {
  if (!timeline.scenes.length) return null;
  const clamped = Math.min(Math.max(t, 0), timeline.duration);
  for (const timed of timeline.scenes) {
    if (clamped < timed.end || timed === timeline.scenes[timeline.scenes.length - 1]) return timed;
  }
  return timeline.scenes[0];
}

export function cueAt(timeline: Timeline, t: number): Cue | null {
  for (const cue of timeline.cues) {
    if (t >= cue.start && t < cue.end) return cue;
  }
  return null;
}

export interface MotionFrame {
  scale: number;
  dx: number;
  dy: number;
}

export function motionAt(progress: number, motion: Motion): MotionFrame {
  const p = Math.min(Math.max(progress, 0), 1);
  switch (motion) {
    case 'in':
      return { scale: 1.04 + 0.1 * p, dx: 0, dy: 0 };
    case 'out':
      return { scale: 1.14 - 0.1 * p, dx: 0, dy: 0 };
    case 'left':
      return { scale: 1.12, dx: 0.025 - 0.05 * p, dy: 0 };
    case 'right':
      return { scale: 1.12, dx: -0.025 + 0.05 * p, dy: 0 };
    default:
      return { scale: 1.06, dx: 0, dy: 0 };
  }
}

/** مستطيل قص الصورة لتغطية الإطار مع الحركة، بإحداثيات البكسل. */
export function coverRect(
  imgW: number,
  imgH: number,
  frameW: number,
  frameH: number,
  frame: MotionFrame,
): { x: number; y: number; w: number; h: number } {
  const scale = Math.max(frameW / imgW, frameH / imgH) * frame.scale;
  const w = imgW * scale;
  const h = imgH * scale;
  return {
    x: (frameW - w) / 2 + frame.dx * frameW,
    y: (frameH - h) / 2 + frame.dy * frameH,
    w,
    h,
  };
}

export function formatSrtTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  const pad = (n: number, size = 2) => String(n).padStart(size, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export function buildSrt(timeline: Timeline): string {
  return timeline.cues
    .map((cue, i) => `${i + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}\n`)
    .join('\n');
}

export function formatClock(seconds: number): string {

  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
