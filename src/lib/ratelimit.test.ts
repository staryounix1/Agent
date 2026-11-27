import { describe, expect, it } from 'vitest';
import {
  afterLimited,
  afterSuccess,
  newSlot,
  readRetryAfter,
  retryAfterFromMessage,
  sleep,
  waitMs,
} from './ratelimit';

describe('readRetryAfter', () => {
  it('reads seconds from a free-tier error message', () => {
    expect(readRetryAfter('الحد المجاني: Retry after 30s')).toBe(30_000);
    expect(readRetryAfter('HTTP 402: retry after 12')).toBe(12_000);
    expect(readRetryAfter('عاود بعد 7 ثوان')).toBe(7_000);
  });

  it('reads a plain retry-after header value as seconds', () => {
    expect(readRetryAfter('45')).toBe(45_000);
    expect(readRetryAfter('45', 'ms')).toBe(45);
  });

  it('returns null when the response carries no hint', () => {
    expect(readRetryAfter(null)).toBeNull();
    expect(readRetryAfter('')).toBeNull();
    expect(readRetryAfter('خطأ عادي بلا رقم')).toBeNull();
  });

  it('caps what a message can ask us to wait', () => {
    expect(retryAfterFromMessage('Retry after 9999s', 120_000)).toBe(120_000);
  });
});

describe('rate slot', () => {
  it('waits the remainder of the gap only', () => {
    const slot = afterSuccess(newSlot(45_000), 1_000);
    expect(waitMs(slot, 1_000)).toBe(45_000);
    expect(waitMs(slot, 41_000)).toBe(5_000);
    expect(waitMs(slot, 60_000)).toBe(0);
  });

  it('honours the provider retry-after instead of the default gap', () => {
    const slot = afterLimited(newSlot(45_000), 10_000, 8_000);
    expect(waitMs(slot, 10_000)).toBe(8_000);
    expect(waitMs(slot, 18_000)).toBe(0);
  });

  it('a fresh slot never waits', () => {
    expect(waitMs(newSlot(45_000), 0)).toBe(0);
  });

  it('sleep resolves without spinning forever', async () => {
    const started = Date.now();
    await sleep(5);
    expect(Date.now() - started).toBeGreaterThanOrEqual(0);
  });
});
