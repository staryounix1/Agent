import { useMemo, useState } from 'react';
import { useStore, projectDuration } from '../store';
import type { Project, View } from '../types';
import { Button, Empty, Field, Icon, IconButton, Pipeline, useToast } from '../ui';
import { buildMeta, publishText } from '../lib/script';
import { copyText } from '../lib/clipboard';
import { track } from '../lib/analytics';
import { formatClock } from '../lib/timeline';
import { downloadText, slugify } from '../lib/exporter';

export function PublishView({ onGo }: { onGo: (view: View) => void }) {
  const { state, project, updateProject, setStage } = useStore();
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  const seriesName = state.series.find((s) => s.id === project?.seriesId)?.name;
  const meta = useMemo(
    () => (project ? project.meta ?? buildMeta(project, seriesName) : null),
    [project, seriesName],
  );

  if (!project || !meta) {
    return (
      <div className="main__inner">
        <Empty
          icon="send"
          title="لا مشروع مفتوح"
          body="افتح مشروعًا ليُنشأ لك نص النشر: عنوان، وصف، وهاشتاغات جاهزة للنسخ."
          action={
            <Button variant="primary" icon="layers" onClick={() => onGo('projects')}>
              إلى المشاريع
            </Button>
          }
        />
      </div>
    );
  }

  const copyAll = async () => {
    const ok = await copyText(publishText(meta));
    track('metadata_copied', { project_id: project.id, kind: 'all', hashtags: meta.hashtags.length });
    toast(ok ? 'نُسخ العنوان والوصف والهاشتاغات' : 'تعذّر النسخ', ok ? 'ok' : 'error');
  };

  const regenerate = () => {
    const next = buildMeta(project, seriesName);
    updateProject(project.id, (p) => ({ ...p, meta: next }));
    setEditing(false);
    toast('أُعيد توليد النص من محتوى المشاهد');
  };

  const exported = project.exportCount > 0;
  const hasVisual = project.scenes.every((s) => s.videoId || s.imageId);
  const allAudio = project.scenes.every((s) => s.audioId);
  const checks = [
    { done: project.scenes.length >= 2, label: `${project.scenes.length} مشاهد في السكريبت` },
    { done: hasVisual, label: 'فيديو أو صورة لكل مشهد' },
    { done: allAudio, label: 'صوت لكل مشهد (تسجيل أو ملف)' },
    { done: exported, label: exported ? `صُدّر ${project.exportCount} مرة` : 'تصدير الفيديو من المونتاج' },
  ];

  return (
    <div className="main__inner">
      <header className="viewhead">
        <div className="viewhead__text">
          <p className="eyebrow">الخطوة ٤ — النشر</p>
          <h1>النص والتصدير</h1>
          <p className="muted">
            {formatClock(projectDuration(project))} · {project.scenes.length} مشاهد ·{' '}
            {exported ? 'الفيديو مُصدَّر' : 'الفيديو لم يُصدَّر بعد'}
          </p>
        </div>
        <div className="viewhead__actions">
          <Button size="sm" icon="film" onClick={() => onGo('edit')}>
            المونتاج والتصدير
          </Button>
          <Button
            variant="primary"
            icon="check"
            onClick={() => {
              setStage(project.id, 'ready');
              track('project_ready', { project_id: project.id, scenes: project.scenes.length });
              toast('المشروع في مرحلة «جاهز»');
            }}
          >
            علّم كجاهز
          </Button>
        </div>
      </header>

      <Pipeline
        stage={project.stage}
        onSelect={(stage) =>
          onGo(stage === 'script' || stage === 'idea' ? 'script' : stage === 'assets' ? 'scenes' : stage === 'edit' ? 'edit' : 'publish')
        }
      />

      <div className="split">
        <section className="meta-card">
          <div className="panel__head">
            <h2>
              <Icon name="send" size={18} /> نص النشر
            </h2>
            <div className="viewhead__actions">
              <IconButton icon="refresh" label="أعد توليد النص" onClick={regenerate} />
              <Button size="sm" icon="pencil" onClick={() => setEditing((v) => !v)}>
                {editing ? 'تم' : 'تعديل'}
              </Button>
            </div>
          </div>

          {editing ? (
            <>
              <Field label="العنوان">
                <input
                  className="input"
                  value={meta.title}
                  maxLength={90}
                  onChange={(e) => updateProject(project.id, (p) => ({ ...p, meta: { ...meta, title: e.target.value } }))}
                />
              </Field>
              <Field label="الوصف" hint="يُستخدم في يوتيوب وتيك توك وفيسبوك.">
                <textarea
                  className="textarea"
                  style={{ minHeight: 180 }}
                  value={meta.description}
                  onChange={(e) =>
                    updateProject(project.id, (p) => ({ ...p, meta: { ...meta, description: e.target.value } }))
                  }
                />
              </Field>
            </>
          ) : (
            <>
              <div className="meta-field">
                <div className="meta-field__head">
                  <span className="meta-field__label">العنوان</span>
                  <IconButton
                    icon="copy"
                    label="نسخ العنوان"
                    onClick={async () => {
                      const ok = await copyText(meta.title);
                      toast(ok ? 'نُسخ العنوان' : 'تعذّر النسخ', ok ? 'ok' : 'error');
                    }}
                  />
                </div>
                <div className="meta-field__value">{meta.title}</div>
              </div>
              <div className="meta-field">
                <div className="meta-field__head">
                  <span className="meta-field__label">الوصف</span>
                  <IconButton
                    icon="copy"
                    label="نسخ الوصف"
                    onClick={async () => {
                      const ok = await copyText(meta.description);
                      track('metadata_copied', { project_id: project.id, kind: 'description' });
                      toast(ok ? 'نُسخ الوصف' : 'تعذّر النسخ', ok ? 'ok' : 'error');
                    }}
                  />
                </div>
                <div className="meta-field__value">{meta.description}</div>
              </div>
            </>
          )}

          <div className="meta-field">
            <div className="meta-field__head">
              <span className="meta-field__label">الهاشتاغات ({meta.hashtags.length})</span>
              <IconButton
                icon="copy"
                label="نسخ الهاشتاغات"
                onClick={async () => {
                  const ok = await copyText(meta.hashtags.join(' '));
                  toast(ok ? 'نُسخت الهاشتاغات' : 'تعذّر النسخ', ok ? 'ok' : 'error');
                }}
              />
            </div>
            <div className="hashtags">
              {meta.hashtags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </div>

          <div className="viewhead__actions">
            <Button variant="primary" icon="copy" onClick={copyAll} block>
              نسخ العنوان والوصف والهاشتاغات
            </Button>
          </div>
          <div className="viewhead__actions">
            <Button
              size="sm"
              icon="download"
              onClick={() => {
                downloadText(`${meta.title}\n\n${meta.description}`, `${slugify(meta.title)}-نص-النشر.txt`);
                toast('نُزّل ملف النص');
              }}
            >
              تنزيل .txt
            </Button>
            <Button
              size="sm"
              icon="share"
              onClick={async () => {
                const text = publishText(meta);
                if (navigator.share) {
                  try {
                    await navigator.share({ title: meta.title, text });
                    return;
                  } catch {
                    /* المستخدم أغلق المشاركة */
                  }
                }
                const ok = await copyText(text);
                toast(ok ? 'المشاركة غير متاحة هنا — نُسخ النص بدلًا منها' : 'تعذّر النسخ', ok ? 'ok' : 'error');
              }}
            >
              مشاركة
            </Button>
          </div>
        </section>

        <aside className="section">
          <div className="card panel" style={{ gap: 'var(--sp-3)' }}>
            <div className="panel__head">
              <h3>
                <Icon name="check" size={18} /> قائمة الجاهزية
              </h3>
            </div>
            <ul className="checklist">
              {checks.map((check) => (
                <li key={check.label} className={check.done ? 'is-done' : ''}>
                  <span className="dot">{check.done ? <Icon name="check" size={12} /> : null}</span>
                  {check.label}
                </li>
              ))}
            </ul>
            {!exported ? (
              <Button variant="primary" icon="film" onClick={() => onGo('edit')} block>
                صدّر الفيديو الآن
              </Button>
            ) : null}
          </div>

          <div className="card panel">
            <div className="panel__head">
              <h3>
                <Icon name="info" size={18} /> ما يُحفظ وأين
              </h3>
            </div>
            <p className="small muted">
              المشاريع والصور والأصوات تُخزَّن في هذا المتصفح فقط (IndexedDB + localStorage)، ولا تُرسل لأي خادم.
              تصدير الفيديو يتم داخل جهازك. إن أفرغت بيانات المتصفح ستحتاج لتصدير ما تحتاجه أولًا.
            </p>
            <ProjectSummary project={project} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function ProjectSummary({ project }: { project: Project }) {
  return (
    <div className="row" style={{ gap: 'var(--sp-3)' }}>
      <div className="stat">
        <span className="stat__value num">{project.scenes.length}</span>
        <span className="stat__label">مشاهد</span>
      </div>
      <div className="stat">
        <span className="stat__value num">{project.exportCount}</span>
        <span className="stat__label">تصديرات</span>
      </div>
      <div className="stat">
        <span className="stat__value num">{formatClock(projectDuration(project))}</span>
        <span className="stat__label">المدة</span>
      </div>
    </div>
  );
}
