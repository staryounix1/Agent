import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { ASPECTS, LANGS, TEMPLATES, type Lang, type Template, type View } from '../types';
import { Button, Empty, Field, Icon, IconButton, Pipeline, useToast } from '../ui';
import { copyText } from '../lib/clipboard';
import { generateScenes, clampIdea } from '../lib/script';
import { newId } from '../lib/storage';
import { speak } from '../lib/audio';
import { track } from '../lib/analytics';
import { formatClock, estimateSeconds } from '../lib/timeline';
import { StageBadge } from './parts';

export function ScriptView({ onGo }: { onGo: (view: View) => void }) {
  const { project, updateProject, setStage } = useStore();
  const toast = useToast();
  const [regenerating, setRegenerating] = useState(false);

  const total = useMemo(
    () => (project ? project.scenes.reduce((sum, s) => sum + s.seconds, 0) : 0),
    [project],
  );

  if (!project) {
    return (
      <div className="main__inner">
        <Empty
          icon="script"
          title="لا مشروع مفتوح"
          body="اختر مشروعًا من قائمة السلاسل، أو أنشئ واحدًا جديدًا، لنكتب السكريبت ونقسّمه إلى مشاهد."
          action={
            <Button variant="primary" icon="layers" onClick={() => onGo('projects')}>
              إلى المشاريع
            </Button>
          }
        />
      </div>
    );
  }

  const patchScene = (id: string, patch: Partial<typeof project.scenes[number]>) => {
    updateProject(project.id, (p) => ({
      ...p,
      scenes: p.scenes.map((scene) => (scene.id === id ? { ...scene, ...patch } : scene)),
    }));
  };

  const regenerate = () => {
    const hasMedia = project.scenes.some((s) => s.imageId || s.audioId);
    if (hasMedia && !window.confirm('إعادة التوليد ستحذف الصور والأصوات المرتبطة بالمشاهد. نكمل؟')) return;
    setRegenerating(true);
    const scenes = generateScenes({
      idea: project.idea,
      lang: project.lang,
      template: project.template,
      seconds: project.targetSeconds,
    });
    updateProject(project.id, (p) => ({ ...p, scenes, stage: 'script', meta: null }));
    track('script_generated', { source: 'regenerate', scenes: scenes.length, project_id: project.id });
    setRegenerating(false);
    toast('تولّد سكريبت جديد');
  };

  const copyScript = async () => {
    const lines = project.scenes
      .map((s, i) => `${i + 1}. ${s.text}\n   المشهد: ${s.visual} (${s.seconds}ث)`)
      .join('\n\n');
    const ok = await copyText(`${project.title}\n\n${lines}`);
    toast(ok ? 'نُسخ السكريبت كاملًا' : 'تعذّر النسخ من المتصفح', ok ? 'ok' : 'error');
  };

  return (
    <div className="main__inner">
      <header className="viewhead">
        <div className="viewhead__text">
          <p className="eyebrow">الخطوة ١ — السكريبت</p>
          <h1>{project.title}</h1>
          <p className="muted">
            {project.scenes.length} مشاهد · {formatClock(total)} · {LANGS.find((l) => l.id === project.lang)?.native}
          </p>
        </div>
        <div className="viewhead__actions">
          <Button icon="copy" size="sm" onClick={copyScript}>
            نسخ السكريبت
          </Button>
          <Button variant="primary" icon="arrow" onClick={() => onGo('scenes')}>
            الصور والصوت
          </Button>
        </div>
      </header>

      <Pipeline
        stage={project.stage}
        onSelect={(stage) =>
          onGo(stage === 'assets' ? 'scenes' : stage === 'edit' ? 'edit' : stage === 'ready' ? 'publish' : 'script')
        }
      />

      <section className="split">
        <div className="card panel">
          <div className="panel__head">
            <h2>
              <Icon name="sparkles" size={18} /> الفكرة والقالب
            </h2>
            <StageBadge stage={project.stage} />
          </div>
          <Field label="الفكرة" hint={`مقترح: ${clampIdea(project.idea)}`}>
            <textarea
              className="textarea"
              value={project.idea}
              onChange={(e) => updateProject(project.id, (p) => ({ ...p, idea: e.target.value }))}
            />
          </Field>
          <div className="row">
            <Field label="القالب">
              <select
                className="select"
                value={project.template}
                onChange={(e) => updateProject(project.id, (p) => ({ ...p, template: e.target.value as Template }))}
              >
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} — {t.desc}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="اللغة">
              <select
                className="select"
                value={project.lang}
                onChange={(e) => updateProject(project.id, (p) => ({ ...p, lang: e.target.value as Lang }))}
              >
                {LANGS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.native}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="النسبة">
              <select
                className="select"
                value={project.aspect}
                onChange={(e) => updateProject(project.id, (p) => ({ ...p, aspect: e.target.value as typeof p.aspect }))}
              >
                {ASPECTS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={`المدة المستهدفة: ${project.targetSeconds} ثانية`}>
            <input
              type="range"
              min={15}
              max={120}
              step={5}
              value={project.targetSeconds}
              onChange={(e) => updateProject(project.id, (p) => ({ ...p, targetSeconds: Number(e.target.value) }))}
              aria-label="المدة المستهدفة"
            />
          </Field>
          <div className="notice">
            <Icon name="info" size={16} />
            <span>
              بنية القالب: {TEMPLATES.find((t) => t.id === project.template)?.structure.join(' ← ')}. التوليد محلي
              وسريع، والنتيجة مسودة أولية تكتبها بأسلوبك.
            </span>
          </div>
          <Button variant="primary" icon="refresh" onClick={regenerate} disabled={regenerating}>
            {regenerating ? 'يولّد…' : 'ولّد السكريبت من جديد'}
          </Button>
        </div>

        <div className="section">
          <div className="panel__head">
            <h3>
              <Icon name="script" size={18} /> المشاهد ({project.scenes.length})
            </h3>
            <Button
              size="sm"
              icon="plus"
              onClick={() =>
                updateProject(project.id, (p) => ({
                  ...p,
                  scenes: [
                    ...p.scenes,
                    {
                      id: newId('sc'),
                      text: '',
                      visual: '',
                      seconds: 4,
                      motion: 'in',
                    },
                  ],
                }))
              }
            >
              مشهد
            </Button>
          </div>

          <div className="script-list">
            {project.scenes.map((scene, i) => (
              <article className="script-scene" key={scene.id}>
                <span className="script-scene__num num">{i + 1}</span>
                <div className="script-scene__body">
                  <textarea
                    className="textarea"
                    style={{ minHeight: 74 }}
                    value={scene.text}
                    aria-label={`نص المشهد ${i + 1}`}
                    placeholder="النص المنطوق في هذا المشهد"
                    onChange={(e) => patchScene(scene.id, { text: e.target.value })}
                  />
                  <div className="script-scene__visual">
                    <Icon name="camera" size={15} />
                    <input
                      className="input"
                      style={{ minHeight: 38, border: '1px solid transparent', background: 'transparent', paddingInline: 0 }}
                      value={scene.visual}
                      aria-label={`وصف المشهد ${i + 1}`}
                      placeholder="وصف المشهد البصري"
                      onChange={(e) => patchScene(scene.id, { visual: e.target.value })}
                    />
                  </div>
                  <div className="script-scene__foot">
                    <span className="num">{estimateSeconds(scene.text, project.lang).toFixed(1)}ث تقديري</span>
                    <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      المدة
                      <input
                        className="inline-input num"
                        type="number"
                        min={1}
                        max={90}
                        step={0.5}
                        value={scene.seconds}
                        aria-label={`مدة المشهد ${i + 1}`}
                        onChange={(e) => patchScene(scene.id, { seconds: Math.max(1, Number(e.target.value) || 1) })}
                      />
                    </label>
                    <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 4 }}>
                      <IconButton
                        icon="play"
                        label={`استمع للمشهد ${i + 1}`}
                        onClick={async () => {
                          try {
                            await speak(scene.text, project.lang);
                          } catch {
                            toast('المتصفح لا يدعم النطق', 'error');
                          }
                        }}
                        disabled={!scene.text.trim()}
                      />
                      <IconButton
                        icon="trash"
                        label={`حذف المشهد ${i + 1}`}
                        variant="danger"
                        disabled={project.scenes.length <= 1}
                        onClick={() =>
                          updateProject(project.id, (p) => ({
                            ...p,
                            scenes: p.scenes.filter((s) => s.id !== scene.id),
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="viewhead__actions" style={{ justifyContent: 'flex-end' }}>
        <Button
          icon="check"
          onClick={() => {
            setStage(project.id, project.stage === 'idea' ? 'script' : project.stage);
            toast('اعتُمد السكريبت');
            onGo('scenes');
          }}
        >
          اعتمد وانتقل للمشاهد
        </Button>
      </div>
    </div>
  );
}
