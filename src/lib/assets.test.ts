import { describe, expect, it } from 'vitest';
import type { Project } from '../types';
import { assetIdsOfProject, exportsToDrop, formatBytes, orphanAssetIds, referencedAssetIds, totalBytes } from './assets';
import { PRODUCE_STAGES, firstOpenStage, overallRatio, stageLabel } from './progress';

function project(over: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    seriesId: 's1',
    title: 't',
    idea: 'i',
    lang: 'ar',
    aspect: '9:16',
    template: 'tips',
    stage: 'edit',
    targetSeconds: 30,
    scenes: [
      { id: 'a', text: 'x', visual: 'v', seconds: 3, motion: 'in', imageId: 'img-a', audioId: 'aud-a' },
      { id: 'b', text: 'y', visual: 'v', seconds: 3, motion: 'in', imageId: 'img-b' },
    ],
    captions: { enabled: true, size: 1 },
    music: { source: 'builtin', volume: 0.2 },
    meta: null,
    createdAt: 0,
    updatedAt: 0,
    exportCount: 0,
    ...over,
  };
}

describe('referencedAssetIds', () => {
  it('collects image, audio, music and exported videos of a project', () => {
    const ids = referencedAssetIds(
      project({
        music: { source: 'upload', assetId: 'music-1', volume: 0.3 },
        exports: [{ id: 'exp-1', name: 'v.mp4', bytes: 10, duration: 12, createdAt: 5 }],
      }),
    );
    expect(new Set(ids)).toEqual(new Set(['img-a', 'aud-a', 'img-b', 'music-1', 'exp-1']));
  });

  it('is empty for a project without assets', () => {
    expect(assetIdsOfProject(project({ scenes: [], music: { source: 'none', volume: 0 } }))).toEqual([]);
  });
});

describe('orphanAssetIds', () => {
  it('keeps assets used by any project and returns the rest', () => {
    const other = project({ id: 'p2', scenes: [{ id: 'c', text: 'z', visual: 'v', seconds: 2, motion: 'in', imageId: 'img-c' }], music: { source: 'none', volume: 0 } });
    const assets = [{ id: 'img-a' }, { id: 'img-b' }, { id: 'img-c' }, { id: 'old' }];
    expect(orphanAssetIds(assets, [project(), other])).toEqual(['old']);
  });

  it('everything is an orphan once the last project is gone', () => {
    const assets = [{ id: 'img-a' }, { id: 'aud-a' }];
    expect(orphanAssetIds(assets, [])).toEqual(['img-a', 'aud-a']);
  });
});

describe('exportsToDrop / sr', () => {
  it('keeps the newest exports only', () => {
    const exports = [1, 2, 3, 4, 5].map((n) => ({ id: `e${n}`, name: '', bytes: 1, duration: 1, createdAt: n }));
    expect(exportsToDrop(project({ exports }), 3)).toEqual(['e1', 'e2']);
    expect(exportsToDrop(project({ exports: exports.slice(0, 3) }), 3)).toEqual([]);
    expect(exportsToDrop(project(), 3)).toEqual([]);
  });

  it('formats sizes and totals bytes', () => {
    expect(totalBytes([{ id: 'a', bytes: 1024 }, { id: 'b', bytes: 2048 }])).toBe(3072);
    expect(formatBytes(0)).toBe('0 م.ب');
    expect(formatBytes(500 * 1024)).toContain('ك.ب');
    expect(formatBytes(5.5 * 1024 * 1024)).toBe('5.5 م.ب');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 غ.ب');
  });
});

describe('produce progress', () => {
  it('stages cover the whole bar', () => {
    const sum = PRODUCE_STAGES.reduce((n, s) => n + s.weight, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it('ratio rises as each stage fills', () => {
    expect(overallRatio({ stage: 'images', done: 0, total: 5 })).toBe(0);
    const half = overallRatio({ stage: 'images', done: 5, total: 5 });
    const voice = overallRatio({ stage: 'voice', done: 1, total: 2 });
    const render = overallRatio({ stage: 'render', done: 0.5, total: 1 });
    const done = overallRatio({ stage: 'render', done: 1, total: 1 });
    expect(half).toBeGreaterThan(0);
    expect(voice).toBeGreaterThan(half);
    expect(render).toBeGreaterThan(voice);
    expect(done).toBeCloseTo(1, 6);
  });

  it('never leaves 0..1', () => {
    expect(overallRatio({ stage: 'images', done: 9, total: 5 })).toBeCloseTo(0.55, 6);
    expect(overallRatio({ stage: 'images', done: -3, total: 5 })).toBe(0);
    expect(overallRatio({ stage: 'images', done: 1, total: 0 })).toBe(0);
  });

  it('labels say what is happening and how far', () => {
    expect(stageLabel({ stage: 'images', done: 2, total: 5 })).toBe('نجيب صور المشاهد 2/5');
    expect(stageLabel({ stage: 'render', done: 0.4, total: 1 })).toBe('نصدّر الفيديو 40٪');
    expect(stageLabel({ stage: 'voice', done: 1, total: 1 })).toBe('نسجّل التعليق الصوتي');
  });

  it('finds the first unfinished stage for a retry', () => {
    expect(firstOpenStage({})).toBe('images');
    expect(firstOpenStage({ images: true })).toBe('voice');
    expect(firstOpenStage({ images: true, voice: true, render: true })).toBeNull();
  });
});
