import { useMemo, useState } from 'react';
import { useStore, projectDuration } from '../store';
import {
  ASPECTS,
  LANGS,
  TEMPLATES,
  type Aspect,
  type Lang,
  type Template,
  type View,
} from '../types';
import { Button, Empty, Field, Icon, IconButton, Modal, useToast } from '../ui';
import { MiniStages, StageBadge, useAssetUrl } from './parts';
import { formatClock } from '../lib/timeline';
import { clampIdea, IDEAS } from '../lib/script';

interface Props {
  onOpen: (view: View) => void;
}

export function ProjectsView({ onOpen }: Props) {
  const { state, createProject, createSeries, selectProject, deleteProject } = useStore();
  const [filter, setFilter] = useState<string>('all');
  const [creating, setCreating] = useState(false);
  const [newSeriesOpen, setNewSeriesOpen] = useState(false);
  const [seriesDraft, setSeriesDraft] = useState('');
  const toast = useToast();

  const projects = useMemo(
    () => (filter === 'all' ? state.projects : state.projects.filter((p) => p.seriesId === filter)),
    [state.projects, filter],
  );

  const ready = state.projects.filter((p) => p.stage === 'ready').length;
  const totalMinutes = Math.round(
    state.projects.reduce((sum, p) => sum + projectDuration(p), 0) / 60,
  );

  const openProject = (id: string) => {
    selectProject(id);
    onOpen('script');
  };

  return (
    <div className="main__inner">
      <section className="hero">
        <div className="hero__grid">
          <div>
            <p className="eyebrow">استوديو السلسلات القصيرة</p>
            <h1>من الفكرة إلى فيديو جاهز للنشر.</h1>
            <p>
              سلسلة واحدة ومشاريع متعددة: سكريبت مقسّم لمشاهد، صورة وصوت لكل مشهد، مونتاج آلي
              بترجمة وموسيقى، ثم ملف فيديو مع عنوان ووصف وهاشتاغ جاهزين للنسخ.
            </p>
            <div className="viewhead__actions" style={{ marginTop: 'var(--sp-5)' }}>
              <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
                مشروع جديد
              </Button>
              {state.projects.length === 0 ? (
                <Button
                  icon="sparkles"
                  onClick={() => {
                    const series = state.series[0] ?? createSeries('سلسلة البداية');
                    createProject({
                      title: 'ثلاث عادات صغيرة تُغيّر صباحك',
                      idea: IDEAS.ar[0],
                      seriesId: series.id,
                      lang: 'ar',
                      aspect: '9:16',
                      template: 'tips',
                      targetSeconds: 45,
                    });
                    onOpen('script');
                    toast('أنشأنا مشروعًا نموذجيًا، عدّل ما تريد ثم صدّر');
                  }}
                >
                  ابدأ بمثال جاهز
                </Button>
              ) : null}
            </div>
          </div>
          <div className="hero__stats">
            <div className="stat">
              <span className="stat__value num">{state.projects.length}</span>
              <span className="stat__label">مشروع</span>
            </div>
            <div className="stat">
              <span className="stat__value num">{state.series.length}</span>
              <span className="stat__label">سلسلة</span>
            </div>
            <div className="stat">
              <span className="stat__value num">{ready}</span>
              <span className="stat__label">جاهز</span>
            </div>
            <div className="stat">
              <span className="stat__value num">{totalMinutes}</span>
              <span className="stat__label">دقيقة</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="panel__head">
          <h2>السلاسل والمشاريع</h2>
          <Button size="sm" icon="plus" onClick={() => setNewSeriesOpen(true)}>
            سلسلة جديدة
          </Button>
        </div>

        <div className="chips" role="tablist" aria-label="تصفية حسب السلسلة">
          <button
            type="button"
            className={`chip ${filter === 'all' ? 'is-active' : ''}`}
            onClick={() => setFilter('all')}
            aria-pressed={filter === 'all'}
          >
            <Icon name="layers" size={14} />
            كل السلاسل
            <span className="num">{state.projects.length}</span>
          </button>
          {state.series.map((series) => {
            const count = state.projects.filter((p) => p.seriesId === series.id).length;
            return (
              <button
                key={series.id}
                type="button"
                className={`chip ${filter === series.id ? 'is-active' : ''}`}
                onClick={() => setFilter(series.id)}
                aria-pressed={filter === series.id}
              >
                {series.name}
                <span className="num">{count}</span>
              </button>
            );
          })}
        </div>

        {projects.length === 0 ? (
          <Empty
            icon="layers"
            title={state.projects.length ? 'لا مشاريع في هذه السلسلة' : 'ابدأ بسلسلة وفكرة'}
            body={
              state.projects.length
                ? 'اختر «كل السلاسل» أو أنشئ مشروعًا جديدًا داخل هذه السلسلة.'
                : 'السلسلة هي اسم القالب الذي تكرّره: قصص، نصائح، أو شرح منتج. أنشئ سلسلة ثم أول مشروع، وسنهيّئ لك السكريبت والمشاهد.'
            }
            action={
              <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
                مشروع جديد
              </Button>
            }
          />
        ) : (
          <div className="projects">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                id={project.id}
                title={project.title}
                series={state.series.find((s) => s.id === project.seriesId)?.name ?? 'بدون سلسلة'}
                stage={project.stage}
                scenes={project.scenes.length}
                duration={formatClock(projectDuration(project))}
                imageId={project.scenes.find((s) => s.imageId)?.imageId}
                onOpen={() => openProject(project.id)}
                onDelete={() => {
                  if (window.confirm(`حذف مشروع «${project.title}»؟ لا يمكن الرجوع.`)) {
                    deleteProject(project.id);
                    toast('حُذف المشروع');
                  }
                }}
              />
            ))}
          </div>
        )}
      </section>

      <NewProjectModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={(input) => {
          createProject(input);
          setCreating(false);
          onOpen('script');
          toast('المشروع جاهز مع سكريبت مبدئي');
        }}
      />

      <Modal
        open={newSeriesOpen}
        onClose={() => setNewSeriesOpen(false)}
        title="سلسلة جديدة"
        footer={
          <>
            <Button variant="quiet" onClick={() => setNewSeriesOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="primary"
              disabled={!seriesDraft.trim()}
              onClick={() => {
                if (!seriesDraft.trim()) return;
                createSeries(seriesDraft);
                setSeriesDraft('');
                setNewSeriesOpen(false);
                toast('أُضيفت السلسلة');
              }}
            >
              إنشاء
            </Button>
          </>
        }
      >
        <Field label="اسم السلسلة" hint="مثال: قصص الحي، نصائح التصوير، وراء الكواليس.">
          <input
            className="input"
            value={seriesDraft}
            onChange={(e) => setSeriesDraft(e.target.value)}
            placeholder="سلسلة جديدة"
          />
        </Field>
        {state.series.length ? (
          <div className="notice">
            <Icon name="info" size={16} />
            <span>
              عندك {state.series.length} سلسلة: {state.series.map((s) => s.name).join('، ')}
            </span>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function ProjectCard({
  id,
  title,
  series,
  stage,
  scenes,
  duration,
  imageId,
  onOpen,
  onDelete,
}: {
  id: string;
  title: string;
  series: string;
  stage: 'idea' | 'script' | 'assets' | 'edit' | 'ready';
  scenes: number;
  duration: string;
  imageId?: string;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const cover = useAssetUrl(imageId);
  return (
    <article
      key={id}
      className="project-card"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button')) return;
        onOpen();
      }}
    >
      <div className="project-card__cover">
        {cover ? <img src={cover} alt="" loading="lazy" /> : null}
        <StageBadge stage={stage} />
        <span className="project-card__play">
          <Icon name="play" size={16} />
        </span>
      </div>
      <div className="project-card__body">
        <span className="small muted">{series}</span>
        <h3 className="project-card__title">{title}</h3>
        <div className="project-card__meta">
          <span>
            <Icon name="film" size={13} /> {scenes} مشاهد
          </span>
          <span>
            <Icon name="clock" size={13} /> {duration}
          </span>
        </div>
        <MiniStages stage={stage} />
        <div className="viewhead__actions" style={{ justifyContent: 'flex-end' }}>
          <IconButton
            icon="trash"
            label="حذف المشروع"
            variant="danger"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          />
          <Button size="sm" variant="primary" icon="arrow" onClick={onOpen}>
            متابعة
          </Button>
        </div>
      </div>
    </article>
  );
}

function NewProjectModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: {
    title: string;
    idea: string;
    seriesId: string;
    lang: Lang;
    aspect: Aspect;
    template: Template;
    targetSeconds: number;
  }) => void;
}) {
  const { state, createSeries } = useStore();
  const [idea, setIdea] = useState('');
  const [title, setTitle] = useState('');
  const [lang, setLang] = useState<Lang>('ar');
  const [aspect, setAspect] = useState<Aspect>('9:16');
  const [template, setTemplate] = useState<Template>('tips');
  const [seconds, setSeconds] = useState(45);
  const [seriesId, setSeriesId] = useState(state.series[0]?.id ?? '__new');
  const [seriesDraft, setSeriesDraft] = useState('');

  const submit = () => {
    let target = seriesId;
    if (target === '__new') {
      if (!seriesDraft.trim()) return;
      target = createSeries(seriesDraft).id;
    }
    if (!idea.trim()) return;
    onCreate({
      title: title.trim() || clampIdea(idea),
      idea: idea.trim(),
      seriesId: target,
      lang,
      aspect,
      template,
      targetSeconds: seconds,
    });
    setIdea('');
    setTitle('');
    setSeriesDraft('');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="مشروع جديد"
      wide
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            icon="sparkles"
            onClick={submit}
            disabled={!idea.trim() || (seriesId === '__new' && !seriesDraft.trim())}
          >
            أنشئ المشروع والسكريبت
          </Button>
        </>
      }
    >
      <Field label="الفكرة" id="idea-input" hint="جملة واحدة تكفي. يُكتب منها السكريبت المبدئي وتُشتق منها الهاشتاغات.">
        <textarea
          id="idea-input"
          className="textarea"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="مثال: ثلاث عادات صغيرة تُغيّر صباحك"
        />
      </Field>
      <div className="chips">
        {IDEAS[lang].slice(0, 4).map((suggestion) => (
          <button key={suggestion} type="button" className="chip" onClick={() => setIdea(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>

      <div className="row">
        <Field label="اللغة">
          <select className="select" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            {LANGS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.native}
              </option>
            ))}
          </select>
        </Field>
        <Field label="السلسلة">
          <select className="select" value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
            {state.series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="__new">+ سلسلة جديدة</option>
          </select>
        </Field>
        <Field label="المدة">
          <div className="chips" style={{ alignItems: 'center' }}>
            <input
              type="range"
              min={15}
              max={90}
              step={5}
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
              aria-label="المدة المستهدفة بالثواني"
            />
            <span className="num small">{seconds}ث</span>
          </div>
        </Field>
      </div>

      {seriesId === '__new' ? (
        <Field label="اسم السلسلة الجديدة">
          <input
            className="input"
            value={seriesDraft}
            onChange={(e) => setSeriesDraft(e.target.value)}
            placeholder="مثال: قصص الحي"
          />
        </Field>
      ) : null}

      <Field label="قالب السكريبت">
        <div className="row">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`chip ${template === t.id ? 'is-active' : ''}`}
              onClick={() => setTemplate(t.id)}
              aria-pressed={template === t.id}
              style={{ justifyContent: 'flex-start', flexDirection: 'column', alignItems: 'flex-start', minHeight: 64, borderRadius: 'var(--r-sm)', padding: '8px 12px' }}
            >
              <strong>{t.label}</strong>
              <span style={{ fontWeight: 400, color: 'inherit', opacity: 0.75 }}>{t.desc}</span>
            </button>
          ))}
        </div>
      </Field>

      <div className="row">
        <Field label="نسبة العرض" hint={ASPECTS.find((a) => a.id === aspect)?.hint}>
          <div className="segmented">
            {ASPECTS.map((a) => (
              <button
                key={a.id}
                type="button"
                className={aspect === a.id ? 'is-active' : ''}
                onClick={() => setAspect(a.id)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="العنوان" hint="اتركه فارغًا لاستخدام الفكرة.">
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={clampIdea(idea) || 'عنوان المشروع'}
          />
        </Field>
      </div>
      <div className="notice">
        <Icon name="info" size={16} />
        <span>
          السكريبت المبدئي يُبنى محليًا داخل المتصفح من قالب {TEMPLATES.find((t) => t.id === template)?.label}:
          {' '}
          {TEMPLATES.find((t) => t.id === template)?.structure.join(' ← ')}. عدّل النصوص بعد الإنشاء كما تريد.
        </span>
      </div>
    </Modal>
  );
}
