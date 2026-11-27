import { describe, expect, it } from 'vitest';
import type { Project } from '../types';
import { parseCommand, parseSeconds, toNumber } from './chat';
import { buildMeta, clampIdea, generateScenes, publishText } from './script';

const base: Omit<Project, 'scenes' | 'title' | 'idea' | 'lang' | 'template'> = {
  id: 'pr_1',
  seriesId: 'sr_1',
  aspect: '9:16',
  stage: 'script',
  targetSeconds: 30,
  captions: { enabled: true, size: 1 },
  music: { source: 'builtin', volume: 0.22 },
  meta: null,
  createdAt: 0,
  updatedAt: 0,
  exportCount: 0,
};

function project(over: Partial<Project> = {}): Project {
  return {
    ...base,
    title: 'ثلاث عادات صغيرة للتسويق',
    idea: 'ثلاث عادات صغيرة للتسويق',
    lang: 'ar',
    template: 'tips',
    scenes: generateScenes({ idea: 'ثلاث عادات صغيرة للتسويق', lang: 'ar', template: 'tips', seconds: 30 }),
    ...over,
  };
}

describe('generateScenes', () => {
  it('produces a fixed number of scenes per template with unique ids', () => {
    const scenes = generateScenes({ idea: 'فكرة', lang: 'ar', template: 'story', seconds: 30 });
    expect(scenes.length).toBeGreaterThanOrEqual(3);
    expect(new Set(scenes.map((s) => s.id)).size).toBe(scenes.length);
    scenes.forEach((scene) => {
      expect(scene.text.trim().length).toBeGreaterThan(0);
      expect(scene.seconds).toBeGreaterThan(0);
    });
  });

  it('is deterministic for text and visual, and includes the idea', () => {
    const a = generateScenes({ idea: 'قهوة الصباح', lang: 'ar', template: 'tips', seconds: 30 });
    const b = generateScenes({ idea: 'قهوة الصباح', lang: 'ar', template: 'tips', seconds: 30 });
    expect(a.map((s) => s.text)).toEqual(b.map((s) => s.text));
    expect(a.map((s) => s.visual)).toEqual(b.map((s) => s.visual));
    expect(a.some((s) => s.text.includes('قهوة الصباح'))).toBe(true);
  });

  it('scales scene lengths with the requested duration', () => {
    const short = generateScenes({ idea: 'فكرة', lang: 'ar', template: 'tips', seconds: 15 });
    const long = generateScenes({ idea: 'فكرة', lang: 'ar', template: 'tips', seconds: 60 });
    const sum = (scenes: { seconds: number }[]) => scenes.reduce((n, s) => n + s.seconds, 0);
    expect(sum(long)).toBeGreaterThan(sum(short));
  });
});

describe('clampIdea', () => {
  it('collapses whitespace, defaults when empty and truncates long ideas', () => {
    expect(clampIdea('  أ   ب  ')).toBe('أ ب');
    expect(clampIdea('   ')).toBe('فكرة جديدة');
    const long = clampIdea('ا'.repeat(200));
    expect(long.length).toBeLessThanOrEqual(90);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('buildMeta', () => {
  it('builds a title capped for social platforms and 8 hashtags at most', () => {
    const meta = buildMeta(project(), 'سلسلة النصائح');
    expect(meta.title.length).toBeLessThanOrEqual(62);
    expect(meta.hashtags.length).toBeLessThanOrEqual(8);
    expect(meta.hashtags).toContain('#نصائح');
    expect(meta.hashtags[0]).toBe('#نصائح');
    expect(meta.description).toContain('احفظ الفيديو');
  });

  it('uses the project language for hook and call to action', () => {
    const en = buildMeta(project({ lang: 'en', title: 'Three habits' }));
    expect(en.description).toContain('The short version');
  });

  it('publishText is title, blank line, description', () => {
    const meta = buildMeta(project());
    expect(publishText(meta)).toBe(`${meta.title}\n\n${meta.description}`);
  });
});

describe('parseSeconds / toNumber', () => {
  it('reads arabic-indic digits and clamps to 12..90', () => {
    expect(toNumber('٣٠')).toBe(30);
    expect(parseSeconds('٣٠ ثانية')).toBe(30);
    expect(parseSeconds('5')).toBe(12);
    expect(parseSeconds('300 ثانية')).toBe(90);
    expect(parseSeconds('بلا رقم')).toBeNull();
  });
});

describe('parseCommand', () => {
  it('recognises produce, shorter, longer and ideas', () => {
    expect(parseCommand('اصنع الفيديو')).toEqual({ kind: 'produce' });
    expect(parseCommand('أقصر')).toEqual({ kind: 'shorter' });
    expect(parseCommand('أطول شوية')).toEqual({ kind: 'longer' });
    expect(parseCommand('أفكار أخرى')).toEqual({ kind: 'ideas' });
  });

  it('parses scene text and scene visual by number', () => {
    expect(parseCommand('مشهد 2: نص جديد')).toEqual({ kind: 'sceneText', index: 2, value: 'نص جديد' });
    expect(parseCommand('صورة المشهد 3: بحر')).toEqual({ kind: 'sceneVisual', index: 3, value: 'بحر' });
  });

  it('treats a long sentence as a rewrite and a short one as plain', () => {
    expect(parseCommand('بدل الفكرة لشيء عن القهوة الباردة')).toEqual({ kind: 'rewrite', value: 'بدل الفكرة لشيء عن القهوة الباردة' });
    expect(parseCommand('مرحبا')).toEqual({ kind: 'plain' });
  });
});
