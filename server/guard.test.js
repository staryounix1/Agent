import { describe, expect, it } from 'vitest';
import { authorize, checkRate, clientIp, MAX_CALLS, originAllowed, WINDOW_MS } from './guard.js';

function req(over = {}) {
  return {
    headers: { host: 'app.example.com', origin: 'https://app.example.com', ...over.headers },
    socket: { remoteAddress: over.ip ?? '1.2.3.4' },
    ...over,
  };
}

const fresh = () => new Map();

describe('originAllowed', () => {
  it('accepts the app own host and registered origins only', () => {
    expect(originAllowed('https://app.example.com', 'app.example.com', {})).toBe(true);
    expect(originAllowed('https://evil.test', 'app.example.com', {})).toBe(false);
    expect(originAllowed('https://studio.test', 'app.example.com', { APP_ORIGINS: 'https://studio.test, https://x.test' })).toBe(true);
    expect(originAllowed('', 'app.example.com', {})).toBe(false);
    expect(originAllowed('not a url', 'app.example.com', {})).toBe(false);
    expect(originAllowed('http://app.example.com:3000', 'app.example.com', {})).toBe(true);
  });
});

describe('clientIp', () => {
  it('prefers the first forwarded address', () => {
    expect(clientIp({ headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }, socket: {} })).toBe('9.9.9.9');
    expect(clientIp({ headers: {}, socket: { remoteAddress: '5.5.5.5' } })).toBe('5.5.5.5');
    expect(clientIp({ headers: {}, socket: {} })).toBe('unknown');
  });
});

describe('authorize', () => {
  it('lets the app page through', () => {
    expect(authorize(req(), {}, 1000, fresh()).ok).toBe(true);
  });

  it('refuses another site', () => {
    const verdict = authorize(req({ headers: { origin: 'https://evil.test' } }), {}, 1000, fresh());
    expect(verdict).toMatchObject({ ok: false, status: 403 });
  });

  it('refuses scripts that send no origin and no shared key', () => {
    const verdict = authorize({ headers: { host: 'app.example.com' }, socket: { remoteAddress: '8.8.8.8' } }, {}, 1000, fresh());
    expect(verdict).toMatchObject({ ok: false, status: 403 });
  });

  it('accepts a script with the matching shared key', () => {
    const env = { APP_SHARED_KEY: 'k-123' };
    const good = authorize({ headers: { host: 'app.example.com', 'x-app-key': 'k-123' }, socket: { remoteAddress: '8.8.8.8' } }, env, 1000, fresh());
    expect(good.ok).toBe(true);
    const bad = authorize({ headers: { host: 'app.example.com', 'x-app-key': 'nope' }, socket: { remoteAddress: '8.8.8.8' } }, env, 1000, fresh());
    expect(bad).toMatchObject({ ok: false, status: 403 });
  });

  it('requires the shared key from the page too when one is configured', () => {
    const env = { APP_SHARED_KEY: 'k-123' };
    expect(authorize(req(), env, 1000, fresh())).toMatchObject({ ok: false, status: 403 });
    expect(authorize(req({ headers: { 'x-app-key': 'k-123' } }), env, 1000, fresh()).ok).toBe(true);
  });

  it('throttles one address after the call budget and keeps others unaffected', () => {
    const store = fresh();
    for (let i = 0; i < MAX_CALLS; i += 1) expect(authorize(req(), {}, 1000 + i, store).ok).toBe(true);
    const blocked = authorize(req(), {}, 2000, store);
    expect(blocked).toMatchObject({ ok: false, status: 429 });
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(authorize(req({ ip: '2.2.2.2' }), {}, 2000, store).ok).toBe(true);
  });

  it('releases the throttle after the window', () => {
    const store = fresh();
    expect(authorize(req(), {}, 0, store).ok).toBe(true);
    for (let i = 0; i < MAX_CALLS; i += 1) checkRate(store, '1.2.3.4', 0);
    expect(authorize(req(), {}, 10, store).ok).toBe(false);
    expect(authorize(req(), {}, WINDOW_MS + 1, store).ok).toBe(true);
  });
});
