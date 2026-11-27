import { describe, expect, it } from 'vitest';
import type { Scene } from '../types';
import {
  audioSchedule,
  buildSrt,
  buildTimeline,
  cueAt,
  estimateSeconds,
  formatSrtTime,
  sceneAt,
  sceneSeconds,
} from './timeline';

function scene(id: string, text: string, seconds: number): Scene {
  return { id, text, visual: 'صورة', seconds, motion: 'in' };
}

describe('estimateSeconds', () => {
  it('grows with the number of words and keeps a floor', () => {
    expect(estimateSeconds('', 'ar')).toBeCloseTo(1.6, 5);
    expect(estimateSeconds('كلمة', 'ar')).toBeCloseTo(1.6, 5);
    const short = estimateSeconds('واحد اثنان ثلاثة', 'ar');
    const long = estimateSeconds('واحد اثنان ثلاثة أربعة خمسة ستة سبعة ثمانية', 'ar');
    expect(long).toBeGreaterThan(short);
  });

  it('is deterministic for the same input', () => {
    const text = 'خمس كلمات هنا في هذا النص';
    expect(estimateSeconds(text, 'fr')).toBe(estimateSeconds(text, 'fr'));
  });
});

describe('sceneSeconds', () => {
  it('never shrinks below the minimum and stretches for narration', () => {
    expect(sceneSeconds(scene('s', 'نص', 0.2), 'ar')).toBe(1.6);
    expect(sceneSeconds(scene('s', 'نص', 2), 'ar', 5)).toBe(5.3);
    expect(sceneSeconds(scene('s', 'نص', 6), 'ar', 2)).toBe(6);
  });
});

describe('buildTimeline', () => {
  const project = {
    lang: 'ar' as const,
    scenes: [
      scene('s1', 'الحاجة الأولى في هذا الفيديو بسيطة جدًا وسريعة.', 3),
      scene('s2', 'الحاجة الثانية في هذا الفيديو بسيطة جدًا وسريعة.', 4),
    ],
  };

  it('lays scenes end to end without gaps or overlaps', () => {
    const timeline = buildTimeline(project);
    expect(timeline.scenes).toHaveLength(2);
    expect(timeline.scenes[0].start).toBe(0);
    expect(timeline.scenes[0].end).toBe(timeline.scenes[1].start);
    expect(timeline.duration).toBeCloseTo(timeline.scenes[1].end, 5);
  });

  it('lengthens a scene when its narration is longer', () => {
    const timeline = buildTimeline(project, { s1: 8 });
    expect(timeline.scenes[0].dur).toBeCloseTo(8.3, 5);
    expect(timeline.scenes[1].start).toBeCloseTo(8.3, 5);
  });

  it('keeps cues inside their scene and covers the spoken text', () => {
    const timeline = buildTimeline(project);
    expect(timeline.cues.length).toBeGreaterThan(0);
    for (const cue of timeline.cues) {
      const timed = timeline.scenes[cue.sceneIndex];
      expect(cue.start).toBeGreaterThanOrEqual(timed.start - 1e-9);
      expect(cue.end).toBeLessThanOrEqual(timed.end + 1e-9);
      expect(cue.end).toBeGreaterThan(cue.start);
    }
    const spoken = timeline.cues.map((cue) => cue.text).join(' ').replace(/\s+/g, ' ');
    expect(spoken).toBe(project.scenes.map((s) => s.text).join(' ').replace(/\s+/g, ' '));
  });
});

describe('sceneAt / cueAt', () => {
  const timeline = buildTimeline({
    lang: 'ar',
    scenes: [scene('s1', 'أول مشهد قصير.', 2), scene('s2', 'ثاني مشهد قصير.', 2)],
  });

  it('picks the scene containing the instant', () => {
    expect(sceneAt(timeline, 0)?.scene.id).toBe('s1');
    expect(sceneAt(timeline, 2.1)?.scene.id).toBe('s2');
  });

  it('clamps past the end to the last scene', () => {
    expect(sceneAt(timeline, 99)?.scene.id).toBe('s2');
  });

  it('returns null for an empty timeline and outside the cues', () => {
    expect(sceneAt({ scenes: [], cues: [], duration: 0, maxChars: 10 }, 1)).toBeNull();
    expect(cueAt(timeline, 1.9)).not.toBeNull();
    expect(cueAt(timeline, -1)).toBeNull();
  });
});

describe('formatSrtTime', () => {
  it('formats whole and fractional seconds', () => {
    expect(formatSrtTime(0)).toBe('00:00:00,000');
    expect(formatSrtTime(4.1)).toBe('00:00:04,100');
    expect(formatSrtTime(3723.456)).toBe('01:02:03,456');
  });

  it('carries rounding into the next second instead of emitting four digits', () => {
    expect(formatSrtTime(4.9996)).toBe('00:00:05,000');
    expect(formatSrtTime(59.9998)).toBe('00:01:00,000');
  });

  it('never emits more than three digits of milliseconds', () => {
    for (let i = 0; i < 2000; i += 1) {
      const stamp = formatSrtTime(i * 0.0137);
      expect(stamp).toMatch(/^\d{2}:\d{2}:\d{2},\d{3}$/);
    }
  });

  it('clamps negatives to zero', () => {
    expect(formatSrtTime(-3)).toBe('00:00:00,000');
  });
});

describe('audioSchedule', () => {
  const timeline = buildTimeline({
    lang: 'ar',
    scenes: [scene('s1', 'أول مشهد قصير.', 2), scene('s2', 'ثاني مشهد قصير.', 3)],
  });

  it('places narration at each scene start, after the shared lead', () => {
    const slots = audioSchedule(timeline, 10);
    expect(slots).toEqual([
      { sceneId: 's1', at: 10 },
      { sceneId: 's2', at: 10 + timeline.scenes[1].start },
    ]);
    expect(slots[1].at).toBeGreaterThan(slots[0].at);
  });

  it('never schedules before the recording starts', () => {
    for (const slot of audioSchedule(timeline, 0.12)) expect(slot.at).toBeGreaterThanOrEqual(0);
  });
});

describe('buildSrt', () => {
  it('writes numbered blocks in order', () => {
    const timeline = buildTimeline({
      lang: 'ar',
      scenes: [scene('s1', 'مشهد أول.', 2), scene('s2', 'مشهد ثاني.', 2)],
    });
    const srt = buildSrt(timeline);
    const blocks = srt.trim().split(/\n\n/);
    expect(blocks).toHaveLength(timeline.cues.length);
    blocks.forEach((block, i) => {
      const [index, range, ...text] = block.split('\n');
      expect(index).toBe(String(i + 1));
      expect(range).toMatch(/^\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}$/);
      expect(text.join(' ').trim().length).toBeGreaterThan(0);
    });
  });
});
