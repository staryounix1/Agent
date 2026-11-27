import { describe, expect, it } from 'vitest';
import { parseBackup } from './backup';
import { base64ToBytes, bytesToBase64 } from './binary';

const minimal = {
  app: 'mashhad',
  version: 1,
  exportedAt: 1,
  series: [],
  projects: [],
  assets: [],
};

describe('parseBackup', () => {
  it('accepts a well-formed backup', () => {
    const file = parseBackup(JSON.stringify(minimal));
    expect(file.app).toBe('mashhad');
    expect(file.projects).toEqual([]);
  });

  it('rejects foreign files, other versions and damaged payloads', () => {
    expect(() => parseBackup(JSON.stringify({ ...minimal, app: 'other' }))).toThrow(/ليس نسخة/);
    expect(() => parseBackup(JSON.stringify({ ...minimal, version: 9 }))).toThrow(/غير مدعومة/);
    expect(() => parseBackup(JSON.stringify({ ...minimal, projects: null }))).toThrow(/تالف/);
  });
});

describe('base64 helpers', () => {
  it('round-trips bytes exactly', () => {
    const bytes = new Uint8Array(70_000);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 251;
    const back = base64ToBytes(bytesToBase64(bytes));
    expect(back.length).toBe(bytes.length);
    expect(back[0]).toBe(0);
    expect(back[69_999]).toBe(69_999 % 251);
  });
});
