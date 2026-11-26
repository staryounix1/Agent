import { useEffect, useState } from 'react';
import { analyticsSink, clearEvents, funnelCounts, getEvents, subscribe, type TrackedEvent } from '../lib/analytics';
import { Button, Empty, Icon, useToast } from '../ui';

const NAMES: Record<string, string> = {
  app_opened: 'فتح التطبيق',
  series_created: 'سلسلة جديدة',
  project_created: 'مشروع جديد',
  project_opened: 'فتح مشروع',
  script_generated: 'توليد سكريبت',
  scene_updated: 'تعديل مشهد',
  image_attached: 'إسناد صورة',
  voice_attached: 'إسناد صوت',
  preview_played: 'معاينة',
  export_started: 'بدء تصدير',
  export_completed: 'تصدير مكتمل',
  captions_downloaded: 'تنزيل ترجمة',
  metadata_copied: 'نسخ نص',
  project_ready: 'مشروع جاهز',
};

function clock(at: number): string {
  return new Date(at).toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function InsightsView() {
  const [events, setEvents] = useState<TrackedEvent[]>(() => getEvents());
  const toast = useToast();

  useEffect(() => subscribe(() => setEvents(getEvents())), []);

  const funnel = funnelCounts(events);
  const max = Math.max(1, ...funnel.map((step) => step.count));

  return (
    <div className="main__inner">
      <header className="viewhead">
        <div className="viewhead__text">
          <p className="eyebrow">القياس</p>
          <h1>مسار التفعيل والأحداث</h1>
          <p className="muted">
            كل حدث يُسجَّل باسم موحّد <code>object_action</code> مع معرّف الجلسة، ويُحفظ آخر 250 حدثًا محليًا.
            {' '}
            {analyticsSink() === 'posthog'
              ? 'مفتاح PostHog موجود: الأحداث تُرسل إليه أيضًا.'
              : 'بدون مفتاح PostHog: السجل محلي وتستطيع ربط PostHog بمتغيّر VITE_POSTHOG_KEY.'}
          </p>
        </div>
        <div className="viewhead__actions">
          <Button
            size="sm"
            icon="trash"
            variant="danger"
            onClick={() => {
              if (window.confirm('تفريغ سجل الأحداث المحلي؟')) {
                clearEvents();
                toast('أُفرغ السجل');
              }
            }}
            disabled={!events.length}
          >
            تفريغ السجل
          </Button>
        </div>
      </header>

      <section className="card panel">
        <div className="panel__head">
          <h2>
            <Icon name="chart" size={18} /> قِمع التفعيل
          </h2>
          <span className="badge num">{events.length} حدثًا</span>
        </div>
        {events.length === 0 ? (
          <Empty
            icon="chart"
            title="لا أحداث بعد"
            body="أنشئ مشروعًا وولّد سكريبتًا وأسند صورة ثم صدّر — ستظهر كل خطوة هنا مباشرة."
          />
        ) : (
          <div className="funnel">
            {funnel.map((step) => (
              <div className="funnel__row" key={step.name}>
                <div className="funnel__bar" style={{ width: `${Math.max(8, (step.count / max) * 100)}%` }}>
                  {step.label}
                </div>
                <span className="funnel__count num">{step.count}</span>
              </div>
            ))}
          </div>
        )}
        <p className="small muted">
          التعريف المعتمد للتفعيل: مشروع أُنشئ ← سكريبت تولّد ← صورة أُسندت ← تصدير بدأ ← تصدير اكتمل ← نص النشر
          نُسخ. نسبة الوصول إلى «تصدير مكتمل» هي المقياس الأساسي لأي تغيير قادم.
        </p>
      </section>

      <section className="card panel">
        <div className="panel__head">
          <h3>آخر الأحداث</h3>
          <span className="small muted num">{events.length} محفوظ</span>
        </div>
        <div className="events">
          {[...events].reverse().map((event) => (
            <div className="event-row" key={event.id}>
              <span className="num muted">{clock(event.at)}</span>
              <div style={{ minWidth: 0 }}>
                <code>{event.name}</code>
                <div className="muted" style={{ fontSize: '0.7rem' }}>
                  {NAMES[event.name] ?? event.name}
                  {Object.keys(event.props).length ? ` · ${JSON.stringify(event.props)}` : ''}
                </div>
              </div>
              <span className="muted num" style={{ fontSize: '0.65rem' }}>
                {event.sessionId.slice(-4)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="card panel">
        <div className="panel__head">
          <h3>تعريف الأحداث</h3>
        </div>
        <div className="events" style={{ maxHeight: 'none' }}>
          {Object.entries(NAMES).map(([name, label]) => (
            <div className="event-row" key={name}>
              <code>{name}</code>
              <span className="muted">{label}</span>
              <span className="num muted small">
                {events.filter((e) => e.name === name).length}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="card panel">
        <div className="panel__head">
          <h3>صحة القياس</h3>
          <span className={`badge ${events.length ? 'badge--ok' : ''}`}>
            {events.length ? 'يستقبل الأحداث' : 'بانتظار أول حدث'}
          </span>
        </div>
        <p className="small muted">
          يُرسل كل حدث مع <code>session_id</code> و<code>distinct_id</code> ثابت للمتصفح، ويُسجَّل التعرّض مرة واحدة لكل
          جلسة عند فتح التطبيق (<code>app_opened</code>)، فلا تتضاعف الأعداد عند إعادة الرسم.
        </p>
      </section>
    </div>
  );
}
