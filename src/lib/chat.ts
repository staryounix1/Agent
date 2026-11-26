import { IDEAS as IDEA_POOL } from './script';
import type { Lang, Template } from '../types';

export type ChatStep = 'template' | 'idea' | 'length' | 'script' | 'producing' | 'done';

const TEMPLATE_WORDS: Record<Template, string[]> = {
  story: ['قصة', 'حكاية', 'حكي', 'تجربة', 'رحلة', 'story', 'histoire'],
  tips: ['نصائح', 'نصيحة', 'حيل', 'أخطاء', 'tips', 'conseils'],
  howto: ['خطوات', 'خطوة', 'كيف', 'طريقة', 'شرح', 'دليل', 'how', 'etapes'],
  promo: ['منتج', 'عرض', 'خدمة', 'بيع', 'إعلان', 'ماركة', 'براند', 'promo', 'produit'],
};

export const TEMPLATE_LABEL: Record<Template, string> = {
  story: 'قصة',
  tips: 'نصائح',
  howto: 'خطوات',
  promo: 'منتج',
};

export function inferTemplate(text: string): Template | null {
  const value = text.toLowerCase();
  for (const template of Object.keys(TEMPLATE_WORDS) as Template[]) {
    if (TEMPLATE_WORDS[template].some((word) => value.includes(word))) return template;
  }
  return null;
}

const SHAPED: Record<Template, string[]> = {
  story: [
    'قصة قصيرة عن يوم تغيّر فيه كل شيء',
    'حكاية مشروع بدأ من غرفة صغيرة',
  ],
  tips: [
    'ثلاث عادات صغيرة تُغيّر صباحك',
    'خمس أخطاء تخسر بها متابعيك',
  ],
  howto: [
    'كيف تصنع فيديو كامل من الهاتف في عشر دقائق',
    'خطوات ترتيب يومك قبل الثامنة صباحًا',
  ],
  promo: [
    'عرض بسيط يجعل الزبون يجرّب خدمتك اليوم',
    'كيف تعرض منتجك في ثلاثين ثانية',
  ],
};

export function ideasFor(template: Template, lang: Lang, round: number): string[] {
  const pool = IDEA_POOL[lang];
  const start = (round * 2) % pool.length;
  const fromPool = [0, 1].map((i) => pool[(start + i) % pool.length]);
  const shaped = SHAPED[template].slice(0, 2);
  const all = lang === 'ar' ? [...shaped, ...fromPool] : fromPool;
  return Array.from(new Set(all)).slice(0, 4);
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function toNumber(raw: string): number | null {
  const normalized = raw
    .split('')
    .map((char) => {
      const at = AR_DIGITS.indexOf(char);
      return at >= 0 ? String(at) : char;
    })
    .join('')
    .replace(/[^\d]/g, '');
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function parseSeconds(text: string): number | null {
  const match = text.match(/([0-9٠-٩]{1,3})\s*(?:ثانية|ثواني|ثاني|ث|s\b|sec)/i);
  const raw = match ? match[1] : text.match(/^[0-9٠-٩]{1,3}$/)?.[0];
  if (!raw) return null;
  const value = toNumber(raw);
  if (value === null) return null;
  return Math.min(90, Math.max(12, value));
}

export type Command =
  | { kind: 'produce' }
  | { kind: 'shorter' }
  | { kind: 'longer' }
  | { kind: 'ideas' }
  | { kind: 'sceneText'; index: number; value: string }
  | { kind: 'sceneVisual'; index: number; value: string }
  | { kind: 'rewrite'; value: string }
  | { kind: 'plain' };

const PRODUCE = /(اصنع|صنع|صدّر|صدر|انتج|أنتج|ولّد|ابدأ|ابدا|يلا|produce|render)/i;
const SHORTER = /(أقصر|اقصر|قصّر|قصير|shorter)/i;
const LONGER = /(أطول|اطول|طوّل|longer)/i;
const IDEAS_CMD = /(أفكار أخرى|افكار اخرى|أعطني أفكار|اعطني افكار|اقترح|اقتراحات)/i;

export function parseCommand(raw: string): Command {
  const text = raw.replace(/\s+/g, ' ').trim();

  const visual = text.match(/(?:صورة|خلفية)\s*(?:المشهد|مشهد)?\s*([0-9٠-٩]+)\s*[:：،]\s*(.+)/);
  if (visual) {
    const index = toNumber(visual[1]);
    if (index !== null) return { kind: 'sceneVisual', index, value: visual[2].trim() };
  }

  const scene = text.match(/(?:المشهد|مشهد)\s*([0-9٠-٩]+)\s*[:：،]\s*(.+)/);
  if (scene) {
    const index = toNumber(scene[1]);
    if (index !== null) return { kind: 'sceneText', index, value: scene[2].trim() };
  }

  if (PRODUCE.test(text)) return { kind: 'produce' };
  if (IDEAS_CMD.test(text)) return { kind: 'ideas' };
  if (SHORTER.test(text)) return { kind: 'shorter' };
  if (LONGER.test(text)) return { kind: 'longer' };

  if (text.split(' ').length >= 5) return { kind: 'rewrite', value: text };
  return { kind: 'plain' };
}
