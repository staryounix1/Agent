import { useEffect, useState } from 'react';
import { Button, Icon, useToast } from '../ui';
import {
  KINDS,
  STAGES,
  isReady,
  loadSettings,
  newProvider,
  saveSettings,
  type Provider,
  type ProviderKind,
  type ProviderSettings,
  type StageId,
} from '../lib/providers';
import { testProvider } from '../lib/ai';

export function SettingsView() {
  const toast = useToast();
  const [settings, setSettings] = useState<ProviderSettings>(() => loadSettings());
  const [adding, setAdding] = useState<StageId | null>(null);
  const [addKind, setAddKind] = useState<ProviderKind>('google');
  const [addLabel, setAddLabel] = useState('');
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; text: string }>>({});

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const update = (id: string, patch: Partial<Provider>) => {
    setSettings((current) => ({
      ...current,
      providers: current.providers.map((provider) => (provider.id === id ? { ...provider, ...patch } : provider)),
    }));
  };

  const assign = (stage: StageId, id: string) => {
    setSettings((current) => ({ ...current, active: { ...current.active, [stage]: id } }));
  };

  const remove = (provider: Provider) => {
    setSettings((current) => {
      const providers = current.providers.filter((item) => item.id !== provider.id);
      const fallback = providers.find((item) => item.stage === provider.stage && item.kind === 'local');
      const active = { ...current.active };
      if (active[provider.stage] === provider.id && fallback) active[provider.stage] = fallback.id;
      return { providers, active };
    });
    toast('تحيّد المزوّد');
  };

  const add = () => {
    if (!adding) return;
    const provider = newProvider(adding, addKind);
    if (addLabel.trim()) provider.label = addLabel.trim();
    setSettings((current) => ({ ...current, providers: [...current.providers, provider] }));
    setAdding(null);
    setAddLabel('');
    toast('تزاد المزوّد — دخّل المفتاح');
  };

  const test = async (provider: Provider) => {
    setTesting(provider.id);
    setResults((current) => ({ ...current, [provider.id]: { ok: true, text: 'كنتحقق…' } }));
    try {
      const message = await testProvider(provider);
      setResults((current) => ({ ...current, [provider.id]: { ok: true, text: message } }));
      toast(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'فشل الاختبار';
      setResults((current) => ({ ...current, [provider.id]: { ok: false, text: message } }));
      toast(message, 'error');
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="stack">
      <section className="card panel">
        <div className="panel__head">
          <h2>
            <Icon name="sparkles" size={18} /> المزوّدون حسب المرحلة
          </h2>
        </div>
        <p className="small muted">
          كل مرحلة تختار مزوّدها المستقل: النص عند Google، الفيديو عند Grok، وهكذا. المفاتيح تبقى مخزّنة في هذا الجهاز فقط، ولا تُرسل لأي جهة غير المزوّد نفسه.
        </p>

        {STAGES.map((stage) => {
          const options = settings.providers.filter((provider) => provider.stage === stage.id);
          const chosen = settings.providers.find((provider) => provider.id === settings.active[stage.id]);
          return (
            <div key={stage.id} className="row stage-row">
              <div>
                <div className="field__label">{stage.label}</div>
                <div className="field__hint">{stage.hint}</div>
              </div>
              <div className="stack-tight">
                <select
                  className="select"
                  value={chosen?.id ?? ''}
                  onChange={(event) => assign(stage.id, event.target.value)}
                  aria-label={`مزوّد ${stage.label}`}
                >
                  {options.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                      {provider.kind === 'local' ? '' : isReady(provider) ? ' ✓' : ' (بلا مفتاح)'}
                    </option>
                  ))}
                </select>
                <div className="row-buttons">
                  {chosen && chosen.kind !== 'local' ? (
                    <Button
                      size="sm"
                      variant="quiet"
                      icon="refresh"
                      onClick={() => void test(chosen)}
                      disabled={testing === chosen.id || !isReady(chosen)}
                    >
                      {testing === chosen.id ? 'كنجرّب…' : 'اختبار'}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="quiet"
                    icon="plus"
                    onClick={() => setAdding(stage.id)}
                    aria-label={`مزوّد جديد لـ${stage.label}`}
                  >
                    مزوّد جديد
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {adding ? (
        <section className="card panel">
          <div className="panel__head">
            <h3>إضافة مزوّد</h3>
            <Button size="sm" variant="quiet" icon="close" onClick={() => setAdding(null)}>
              إلغاء
            </Button>
          </div>
          <label className="field">
            <span className="field__label">المرحلة</span>
            <select className="select" value={adding} onChange={(event) => setAdding(event.target.value as StageId)}>
              {STAGES.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">النوع</span>
            <select className="select" value={addKind} onChange={(event) => setAddKind(event.target.value as ProviderKind)}>
              {KINDS.filter((kind) => kind.id !== 'local').map((kind) => (
                <option key={kind.id} value={kind.id}>
                  {kind.label}
                </option>
              ))}
            </select>
            <span className="field__hint">«متوافق مع OpenAI» يخدم أي خدمة بنفس الشكل: Groq، OpenRouter، Together…</span>
          </label>
          <label className="field">
            <span className="field__label">الاسم</span>
            <input
              className="input"
              value={addLabel}
              onChange={(event) => setAddLabel(event.target.value)}
              placeholder="مثال: Groq للسرعة"
            />
          </label>
          <Button variant="primary" icon="plus" onClick={add}>
            أضف المزوّد
          </Button>
        </section>
      ) : null}

      <section className="card panel">
        <div className="panel__head">
          <h2>
            <Icon name="key" size={18} /> المفاتيح والإعدادات
          </h2>
        </div>
        {settings.providers.map((provider) => (
          <div key={provider.id} className="provider">
            <div className="provider__head">
              <strong>{provider.label}</strong>
              <span className="badge">
                {STAGES.find((stage) => stage.id === provider.stage)?.label}
                {provider.kind === 'local' ? ' · محلي' : isReady(provider) ? ' · جاهز' : ' · بلا مفتاح'}
              </span>
            </div>

            {provider.kind === 'local' ? (
              <p className="field__hint">يعمل دون إنترنت ودون مفتاح.</p>
            ) : (
              <>
                <div className="row provider__grid">
                  <label className="field">
                    <span className="field__label">الرابط الأساسي</span>
                    <input
                      className="input num"
                      dir="ltr"
                      value={provider.baseUrl}
                      onChange={(event) => update(provider.id, { baseUrl: event.target.value })}
                      placeholder="https://api.example.com/v1"
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">الموديل</span>
                    <input
                      className="input num"
                      dir="ltr"
                      value={provider.model}
                      onChange={(event) => update(provider.id, { model: event.target.value })}
                      placeholder="model-id"
                    />
                  </label>
                </div>
                <div className="row provider__grid">
                  <div className="field">
                    <span className="field__label">المفتاح</span>
                    <div className="key-row">
                      <input
                        className="input num"
                        dir="ltr"
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        value={provider.key}
                        onChange={(event) => update(provider.id, { key: event.target.value })}
                        placeholder={provider.kind === 'pollinations' ? 'لا يحتاج مفتاحًا' : 'sk-…'}
                      />
                      <Button
                        size="sm"
                        variant="quiet"
                        icon="check"
                        onClick={() => void test(provider)}
                        disabled={testing === provider.id || !isReady(provider)}
                        aria-label={`تحقق من مفتاح ${provider.label}`}
                      >
                        {testing === provider.id ? '…' : 'تحقق'}
                      </Button>
                    </div>
                    {results[provider.id] ? (
                      <span className={`field__hint ${results[provider.id].ok ? 'is-ok' : 'is-error'}`}>
                        {results[provider.id].text}
                      </span>
                    ) : null}
                  </div>
                  <div className="row-buttons">
                    {provider.builtin ? null : (
                      <Button size="sm" variant="danger" icon="trash" onClick={() => remove(provider)}>
                        حذف
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </section>

      <section className="card panel">
        <div className="panel__head">
          <h3>
            <Icon name="info" size={18} /> ملاحظات
          </h3>
        </div>
        <ul className="notes">
          <li>أي مزوّد بلا مفتاح يُتجاهل، ويعود التطبيق للمزوّد المحلي تلقائيًا.</li>
          <li>مزوّد الفيديو (Grok) يحتاج اتصالًا بالخادم: دالة `api/grok-video.js` تعمل على Vercel، وليست داخل نسخة APK.</li>
          <li>التعليق الصوتي الآلي محفوظ في الإعدادات، لكنه غير مربوط بمسار التصدير بعد.</li>
          <li>بعض المزوّدين يمنعون الاتصال من المتصفح (CORS)؛ عندها استخدم مزوّدًا يسمح بذلك.</li>
          <li>في نسخة APK تبقى المفاتيح داخل التطبيق فقط، وتُحذف بحذف بيانات التطبيق.</li>
        </ul>
      </section>
    </div>
  );
}
