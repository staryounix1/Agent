import type { Lang, Project } from '../types';
import { LANGS } from '../types';
import { coverRect, cueAt, motionAt, sceneAt, type Timeline } from './timeline';

const PALETTES: [string, string][] = [
  ['#2a1a10', '#b8632b'],
  ['#101c1a', '#2f7d6b'],
  ['#1a1226', '#6b4a9e'],
  ['#221a10', '#c98a3c'],
  ['#101826', '#3f6fa8'],
];

export interface VisualFrame {
  kind: 'image' | 'video';
  source: CanvasImageSource;
  width: number;
  height: number;
}

export interface FrameOptions {
  width: number;
  height: number;
  lang: Lang;
  captions: boolean;
  captionSize: number;
  seriesName: string;
  getVisual: (index: number) => VisualFrame | null;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines) {
    const consumed = lines.join(' ').split(/\s+/).length;
    if (consumed < words.length) {
      let last = lines[maxLines - 1];
      while (last.length > 4 && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1).trim();
      }
      lines[maxLines - 1] = `${last}…`;
    }
  }
  return lines;
}

function drawFallback(ctx: CanvasRenderingContext2D, index: number, w: number, h: number): void {
  const [dark, accent] = PALETTES[index % PALETTES.length];
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, dark);
  gradient.addColorStop(0.55, accent);
  gradient.addColorStop(1, dark);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(w * 0.3, h * 0.32, 0, w * 0.3, h * 0.32, w * 0.75);
  glow.addColorStop(0, 'rgba(255,255,255,0.22)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#0b0a09';
  for (let i = 0; i < 26; i += 1) {
    const x = (i * 137.5) % w;
    const y = (i * 219.3) % h;
    ctx.beginPath();
    ctx.arc(x, y, 2 + ((i * 7) % 5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  timeline: Timeline,
  time: number,
  opts: FrameOptions,
): void {
  const { width: w, height: h, lang } = opts;
  const dir = LANGS.find((l) => l.id === lang)?.dir ?? 'rtl';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0b0a09';
  ctx.fillRect(0, 0, w, h);

  const timed = sceneAt(timeline, time);
  if (!timed) {
    ctx.restore();
    return;
  }
  const progress = timed.dur > 0 ? (time - timed.start) / timed.dur : 0;
  const visual = opts.getVisual(timed.index);
  if (visual && visual.width && visual.height) {
    const frame = visual.kind === 'video' ? { scale: 1, dx: 0, dy: 0 } : motionAt(progress, timed.scene.motion);
    const rect = coverRect(visual.width, visual.height, w, h, frame);
    ctx.drawImage(visual.source, rect.x, rect.y, rect.w, rect.h);
  } else {
    drawFallback(ctx, timed.index, w, h);
  }

  const topFade = ctx.createLinearGradient(0, 0, 0, h * 0.28);
  topFade.addColorStop(0, 'rgba(8,7,6,0.72)');
  topFade.addColorStop(1, 'rgba(8,7,6,0)');
  ctx.fillStyle = topFade;
  ctx.fillRect(0, 0, w, h * 0.28);

  const bottomFade = ctx.createLinearGradient(0, h * 0.5, 0, h);
  bottomFade.addColorStop(0, 'rgba(8,7,6,0)');
  bottomFade.addColorStop(0.55, 'rgba(8,7,6,0.55)');
  bottomFade.addColorStop(1, 'rgba(8,7,6,0.92)');
  ctx.fillStyle = bottomFade;
  ctx.fillRect(0, h * 0.5, w, h * 0.5);

  // شريط علوي: اسم السلسلة ورقم المشهد
  const pad = Math.round(w * 0.045);
  ctx.direction = dir;
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(w * 0.026)}px Cairo, system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(245,241,234,0.86)';
  ctx.textAlign = dir === 'rtl' ? 'right' : 'left';
  ctx.fillText(opts.seriesName, dir === 'rtl' ? w - pad : pad, pad * 1.1);

  const counter = `${timed.index + 1}/${timeline.scenes.length}`;
  ctx.textAlign = dir === 'rtl' ? 'left' : 'right';
  ctx.fillStyle = 'rgba(245,241,234,0.7)';
  ctx.fillText(counter, dir === 'rtl' ? pad : w - pad, pad * 1.1);

  // الترجمة
  const cue = cueAt(timeline, time);
  if (opts.captions && cue) {
    const size = Math.round(w * 0.05 * opts.captionSize);
    ctx.font = `800 ${size}px Cairo, system-ui, sans-serif`;
    ctx.direction = dir;
    ctx.textAlign = 'center';
    const maxWidth = w * 0.84;
    const lines = wrapLines(ctx, cue.text, maxWidth, 3);
    const lineHeight = size * 1.4;
    const blockH = lines.length * lineHeight;
    const centerY = h * 0.78;
    const top = centerY - blockH / 2;

    let widest = 0;
    for (const line of lines) widest = Math.max(widest, ctx.measureText(line).width);
    const platePadX = size * 0.6;
    const platePadY = size * 0.45;
    const plateW = Math.min(w - pad * 1.2, widest + platePadX * 2);
    const plateH = blockH + platePadY * 2;

    const fade = Math.max(
      0,
      Math.min(1, (time - cue.start) / 0.14, (cue.end - time) / 0.14),
    );

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = 'rgba(10,9,8,0.62)';
    roundedRect(ctx, (w - plateW) / 2, top - platePadY, plateW, plateH, size * 0.35);
    ctx.fill();

    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = size * 0.3;
    ctx.shadowOffsetY = size * 0.05;
    ctx.fillStyle = '#FBF7F0';
    lines.forEach((line, i) => {
      ctx.fillText(line, w / 2, top + lineHeight * (i + 0.5));
    });
    ctx.restore();
  }

  // شريط التقدم
  const barH = Math.max(3, Math.round(h * 0.004));
  const barY = h - barH;
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(0, barY, w, barH);
  const ratio = timeline.duration > 0 ? Math.min(1, Math.max(0, time / timeline.duration)) : 0;
  ctx.fillStyle = '#FFB057';
  const barW = w * ratio;
  if (dir === 'rtl') ctx.fillRect(w - barW, barY, barW, barH);
  else ctx.fillRect(0, barY, barW, barH);

  ctx.direction = 'ltr';
  ctx.restore();
}

export async function ensureCaptionFonts(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load('800 48px Cairo'),
      document.fonts.load('700 32px Cairo'),
    ]);
    await document.fonts.ready;
  } catch {
    /* الخطوط النظامية بديل مقبول */
  }
}

export function frameOptionsFor(project: Project, width: number, height: number, seriesName: string, getVisual: (i: number) => VisualFrame | null): FrameOptions {
  return {
    width,
    height,
    lang: project.lang,
    captions: project.captions.enabled,
    captionSize: project.captions.size,
    seriesName,
    getVisual,
  };
}
