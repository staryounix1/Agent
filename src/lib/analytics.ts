export type EventName =
  | 'app_opened'
  | 'series_created'
  | 'project_created'
  | 'project_opened'
  | 'script_generated'
  | 'scene_updated'
  | 'visual_attached'
  | 'grok_generation_started'
  | 'grok_generation_done'
  | 'voice_attached'
  | 'preview_played'
  | 'export_started'
  | 'export_completed'
  | 'captions_downloaded'
  | 'metadata_copied'
  | 'chat_message'
  | 'project_ready';

export interface TrackedEvent {
  id: string;
  name: EventName;
  props: Record<string, unknown>;
  at: number;
  sessionId: string;
}

const EVENTS_KEY = 'mashhad.events.v1';
const USER_KEY = 'mashhad.user.v1';
const SESSION_KEY = 'mashhad.session.v1';
const MAX_EVENTS = 250;

function readId(key: string, storage: Storage, prefix: string): string {
  let value = storage.getItem(key);
  if (!value) {
    value = `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    storage.setItem(key, value);
  }
  return value;
}

let userId = '';
let sessionId = '';
const listeners = new Set<() => void>();

export function initAnalytics(): void {
  userId = readId(USER_KEY, localStorage, 'u');
  sessionId = readId(SESSION_KEY, sessionStorage, 's');
  if (!sessionStorage.getItem('mashhad.opened')) {
    sessionStorage.setItem('mashhad.opened', '1');
    track('app_opened', { language: document.documentElement.lang || 'ar' });
  }
}

export function track(name: EventName, props: Record<string, unknown> = {}): void {
  if (!sessionId) {
    sessionId = readId(SESSION_KEY, sessionStorage, 's');
    userId = userId || readId(USER_KEY, localStorage, 'u');
  }
  const event: TrackedEvent = {
    id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    props,
    at: Date.now(),
    sessionId,
  };
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    const list: TrackedEvent[] = raw ? (JSON.parse(raw) as TrackedEvent[]) : [];
    list.push(event);
    localStorage.setItem(EVENTS_KEY, JSON.stringify(list.slice(-MAX_EVENTS)));
  } catch {
    /* التخزين ممتلئ أو محظور: لا نُفشل الواجهة */
  }
  forward(event);
  listeners.forEach((fn) => fn());
}

function forward(event: TrackedEvent): void {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key) return;
  const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com';
  void fetch(`${host}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({
      api_key: key,
      event: event.name,
      distinct_id: userId,
      timestamp: new Date(event.at).toISOString(),
      properties: { ...event.props, $session_id: event.sessionId, $current_url: location.href },
    }),
  }).catch(() => undefined);
}

/** وجهة الأحداث: PostHog عند وجود مفتاح، وإلا السجل المحلي داخل التطبيق. */
export function analyticsSink(): 'posthog' | 'local' {
  return (import.meta.env.VITE_POSTHOG_KEY as string | undefined) ? 'posthog' : 'local';
}

export function getEvents(): TrackedEvent[] {
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    return raw ? (JSON.parse(raw) as TrackedEvent[]) : [];
  } catch {
    return [];
  }
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearEvents(): void {
  localStorage.removeItem(EVENTS_KEY);
  listeners.forEach((fn) => fn());
}

export const FUNNEL: { name: EventName; label: string }[] = [
  { name: 'project_created', label: 'إنشاء مشروع' },
  { name: 'script_generated', label: 'توليد السكريبت' },
  { name: 'visual_attached', label: 'فيديو أو صورة لمشهد' },
  { name: 'export_started', label: 'بدء التصدير' },
  { name: 'export_completed', label: 'اكتمال الفيديو' },
  { name: 'metadata_copied', label: 'نسخ نص النشر' },
];

export function funnelCounts(events: TrackedEvent[]): { name: EventName; label: string; count: number }[] {
  return FUNNEL.map((step) => ({
    ...step,
    count: events.filter((e) => e.name === step.name).length,
  }));
}
