import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { Project, Scene, View } from '../types';
import { Button, Empty, Field, Icon, IconButton, Modal, Pipeline, useToast } from '../ui';
import { useAssetUrl } from './parts';
import { speak, startMicRecording, ttsSupported } from '../lib/audio';
import { track } from '../lib/analytics';
import { generateGrokVideo, grokConfigured, grokPromptFromScene, type GrokPhase } from '../lib/grok';

const GALLERY = ['/stock/scene-1.jpg', '/stock/scene-2.jpg', '/stock/scene-3.jpg', '/stock/scene-4.jpg'];

async function urlToBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('تعذّر تحميل الصورة');
  return response.blob();
}

export function ScenesView({ onGo }: { onGo: (view: View) => void }) {
  const { project, updateProject, saveSceneImage, saveSceneVideo, saveSceneAudio } = useStore();
  const toast = useToast();
  const [galleryFor, setGalleryFor] = useState<string | null>(null);
  const [grokFor, setGrokFor] = useState<string | null>(null);

  if (!project) {
    return (
      <div className="main__inner">
        <Empty
          icon="image"
          title="لا مشروع مفتوح"
          body="افتح مشروعًا أولًا، ثم أضف فيديو أو صورة وصوتًا لكل مشهد."
          action={
            <Button variant="primary" icon="layers" onClick={() => onGo('projects')}>
              إلى المشاريع
            </Button>
          }
        />
      </div>
    );
  }

  const withVideo = project.scenes.filter((s) => s.videoId).length;
  const withImage = project.scenes.filter((s) => s.imageId).length;
  const withAudio = project.scenes.filter((s) => s.audioId).length;
  const grokScene = project.scenes.find((s) => s.id === grokFor) ?? null;

  const next = () => {
    updateProject(project.id, (p) => ({ ...p, stage: p.stage === 'ready' ? 'ready' : 'edit' }));
    onGo('edit');
  };

  return (
    <div className="main__inner">
      <header className="viewhead">
        <div className="viewhead__text">
          <p className="eyebrow">الخطوة ٢ — الفيديو والصوت</p>
          <h1>استوديو المشاهد</h1>
          <p className="muted">
            فيديو {withVideo}/{project.scenes.length} · صورة {withImage}/{project.scenes.length} · صوت{' '}
            {withAudio}/{project.scenes.length} — كل الملفات تُخزّن داخل جهازك، لا تُرفع لأي خادم.
          </p>
        </div>
        <div className="viewhead__actions">
          <Button variant="primary" icon="arrow" onClick={next}>
            المونتاج
          </Button>
        </div>
      </header>

      <Pipeline
        stage={project.stage}
        onSelect={(stage) =>
          onGo(stage === 'script' || stage === 'idea' ? 'script' : stage === 'edit' ? 'edit' : stage === 'ready' ? 'publish' : 'scenes')
        }
      />

      <div className="notice">
        <Icon name="info" size={16} />
        <span>
          المسار المجاني: ولّد المقطع في تطبيق Grok (Imagine) ثم نزّله وارفعه هنا بـ«فيديو من الهاتف». المسار
          المباشر داخل مشهد يحتاج مفتاح xAI مدفوعًا (الخطة المجانية لا تشمل الفيديو عبر API).
        </span>
      </div>

      <div className="scene-list">
        {project.scenes.map((scene, index) => (
          <SceneCard
            key={scene.id}
            project={project}
            scene={scene}
            index={index}
            onPickGallery={() => setGalleryFor(scene.id)}
            onPickGrok={() => setGrokFor(scene.id)}
            onPatch={(patch) =>
              updateProject(project.id, (p) => ({
                ...p,
                scenes: p.scenes.map((s) => (s.id === scene.id ? { ...s, ...patch } : s)),
              }))
            }
            onImage={async (file) => {
              await saveSceneImage(project.id, scene.id, file, file.name || 'صورة');
              toast('أُضيفت الصورة');
            }}
            onVideo={async (file, fromGrok) => {
              await saveSceneVideo(project.id, scene.id, file, file.name || 'مقطع', fromGrok);
              toast(fromGrok ? 'أُضيف مقطع Grok' : 'أُضيف الفيديو');
            }}
            onAudio={async (blob, name, source) => {
              await saveSceneAudio(project.id, scene.id, blob, name, source);
              toast(source === 'mic' ? 'سُجّل الصوت' : 'أُضيف الصوت');
            }}
            onRemoveAudio={() =>
              updateProject(project.id, (p) => ({
                ...p,
                scenes: p.scenes.map((s) =>
                  s.id === scene.id ? { ...s, audioId: undefined, audioSeconds: undefined, voiceSource: undefined } : s,
                ),
              }))
            }
          />
        ))}
      </div>

      <GalleryModal
        open={!!galleryFor}
        onClose={() => setGalleryFor(null)}
        onPick={async (url) => {
          if (!galleryFor) return;
          try {
            const blob = await urlToBlob(url);
            await saveSceneImage(project.id, galleryFor, blob, url.split('/').pop() ?? 'خلفية');
            toast('أُضيفت الخلفية');
          } catch {
            toast('تعذّر تحميل الخلفية', 'error');
          }
          setGalleryFor(null);
        }}
      />

      {grokScene ? (
        <GrokModal
          scene={grokScene}
          project={project}
          onClose={() => setGrokFor(null)}
          onReady={async (blob) => {
            await saveSceneVideo(project.id, grokScene.id, blob, 'grok.mp4', true);
            setGrokFor(null);
            toast('مقطع Grok جاهز في المشهد');
          }}
        />
      ) : null}
    </div>
  );
}

function SceneCard({
  project,
  scene,
  index,
  onPatch,
  onImage,
  onVideo,
  onAudio,
  onRemoveAudio,
  onPickGallery,
  onPickGrok,
}: {
  project: Project;
  scene: Scene;
  index: number;
  onPatch: (patch: Partial<Scene>) => void;
  onImage: (file: File) => Promise<void>;
  onVideo: (file: File, fromGrok?: boolean) => Promise<void>;
  onAudio: (blob: Blob, name: string, source: 'mic' | 'upload') => Promise<void>;
  onRemoveAudio: () => void;
  onPickGallery: () => void;
  onPickGrok: () => void;
}) {
  const toast = useToast();
  const imageUrl = useAssetUrl(scene.imageId);
  const videoUrl = useAssetUrl(scene.videoId);
  const audioUrl = useAssetUrl(scene.audioId);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<Awaited<ReturnType<typeof startMicRecording>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);

  const startRecording = async () => {
    try {
      recorder.current = await startMicRecording();
      setRecording(true);
    } catch {
      toast('لم نتمكن من فتح الميكروفون — تحقق من إذن المتصفح', 'error');
    }
  };

  const stopRecording = async () => {
    const active = recorder.current;
    recorder.current = null;
    setRecording(false);
    if (!active) return;
    setBusy(true);
    try {
      const blob = await active.stop();
      await onAudio(blob, `تسجيل-${index + 1}`, 'mic');
    } catch {
      toast('تعذّر حفظ التسجيل', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="scene-card">
      <div>
        <div className="scene-card__media">
          {videoUrl ? (
            <>
              <video
                ref={videoRef}
                src={videoUrl}
                muted
                loop
                playsInline
                preload="metadata"
                aria-label={`فيديو المشهد ${index + 1}`}
                onClick={() => {
                  const v = videoRef.current;
                  if (!v) return;
                  if (v.paused) void v.play().catch(() => undefined);
                  else v.pause();
                }}
              />
              <span className="badge badge--accent" style={{ position: 'absolute', insetBlockStart: 8, insetInlineStart: 8 }}>
                {scene.videoFromGrok ? 'Grok' : 'فيديو'} · {(scene.videoSeconds ?? 0).toFixed(1)}ث
              </span>
            </>
          ) : imageUrl ? (
            <img src={imageUrl} alt={`صورة المشهد ${index + 1}`} loading="lazy" />
          ) : (
            <div className="scene-card__media-empty">
              <Icon name="film" size={22} />
              <span>بلا وسيط — سيُستخدم تدرّج لوني</span>
            </div>
          )}
        </div>

        <div className="chips" style={{ marginTop: 'var(--sp-2)', justifyContent: 'center' }}>
          <Button size="sm" icon="upload" onClick={() => videoInput.current?.click()} disabled={busy}>
            فيديو
          </Button>
          <Button size="sm" icon="sparkles" onClick={onPickGrok}>
            Grok
          </Button>
          <Button size="sm" icon="image" onClick={onPickGallery}>
            خلفية
          </Button>
          {scene.videoId || scene.imageId ? (
            <IconButton
              icon="trash"
              label="إزالة الوسيط"
              variant="danger"
              onClick={() => onPatch({ videoId: undefined, videoSeconds: undefined, videoFromGrok: undefined, imageId: undefined })}
            />
          ) : null}
        </div>

        <input
          ref={videoInput}
          type="file"
          accept="video/*"
          className="hidden-input"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setBusy(true);
            try {
              await onVideo(file);
            } finally {
              setBusy(false);
            }
          }}
        />
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          className="hidden-input"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) await onImage(file);
          }}
        />
      </div>

      <div className="scene-card__body">
        <div className="scene-card__head">
          <h3>
            <span className="script-scene__num num">{index + 1}</span> المشهد {index + 1}
          </h3>
          <span className="badge num">{scene.seconds.toFixed(1)}ث</span>
        </div>

        <textarea
          className="textarea"
          style={{ minHeight: 68 }}
          value={scene.text}
          aria-label={`نص المشهد ${index + 1}`}
          placeholder="النص المنطوق"
          onChange={(e) => onPatch({ text: e.target.value })}
        />
        <input
          className="input"
          value={scene.visual}
          aria-label={`وصف المشهد ${index + 1}`}
          placeholder="وصف المشهد البصري (يُستخدم وصفًا لتوليد Grok)"
          onChange={(e) => onPatch({ visual: e.target.value })}
        />

        <div className="voice-row">
          <Button
            size="sm"
            icon="sparkles"
            disabled={!scene.text.trim() || reading}
            onClick={async () => {
              if (!ttsSupported()) {
                toast('المتصفح لا يدعم النطق', 'error');
                return;
              }
              setReading(true);
              track('preview_played', { scene_id: scene.id, mode: 'tts' });
              try {
                await speak(scene.text, project.lang);
              } catch {
                toast('تعذّر تشغيل النطق', 'error');
              } finally {
                setReading(false);
              }
            }}
          >
            {reading ? 'يقرأ…' : 'اسمع المسودة'}
          </Button>

          {recording ? (
            <Button size="sm" variant="danger" icon="stop" onClick={stopRecording}>
              إيقاف وحفظ
            </Button>
          ) : (
            <Button size="sm" icon="mic" onClick={startRecording} disabled={busy}>
              سجّل بصوتك
            </Button>
          )}

          <Button size="sm" icon="upload" onClick={() => audioInput.current?.click()} disabled={busy}>
            ملف صوت
          </Button>
          <input
            ref={audioInput}
            type="file"
            accept="audio/*"
            className="hidden-input"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              setBusy(true);
              try {
                await onAudio(file, file.name, 'upload');
              } finally {
                setBusy(false);
              }
            }}
          />

          {scene.audioSeconds ? <span className="badge badge--ok num">{scene.audioSeconds.toFixed(1)}ث صوت</span> : null}
          <span className="small" style={{ marginInlineStart: 'auto' }}>
            {busy ? 'يُعالج…' : scene.audioId ? 'صوت مرتبط' : 'لا صوت بعد'}
          </span>
        </div>

        {audioUrl ? (
          <div className="voice-row" style={{ borderStyle: 'solid' }}>
            <audio src={audioUrl} controls preload="metadata" style={{ width: '100%', height: 36 }} />
            <IconButton icon="trash" label="حذف الصوت" variant="danger" onClick={onRemoveAudio} />
          </div>
        ) : null}

        <div className="row" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))' }}>
          <Field label="حركة الصورة">
            <select
              className="select"
              value={scene.motion}
              onChange={(e) => onPatch({ motion: e.target.value as Scene['motion'] })}
              disabled={!!scene.videoId}
            >
              <option value="in">تقريب داخل</option>
              <option value="out">تقريب خارج</option>
              <option value="left">انزلاق يسار</option>
              <option value="right">انزلاق يمين</option>
              <option value="none">ثابتة</option>
            </select>
          </Field>
          <Field label="المدة (ثانية)">
            <input
              className="input num"
              type="number"
              min={1}
              max={90}
              step={0.5}
              value={scene.seconds}
              onChange={(e) => onPatch({ seconds: Math.max(1, Number(e.target.value) || 1) })}
            />
          </Field>
        </div>

        {!scene.videoId && !scene.imageId ? (
          <p className="notice">
            <Icon name="info" size={16} />
            <span>أضف فيديو أو خلفية. بدون وسيط سيرسم التطبيق تدرّجًا لونيًا مع الحركة والترجمة.</span>
          </p>
        ) : null}
      </div>
    </article>
  );
}

function GalleryModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="مكتبة الخلفيات" wide>
      <p className="muted small">خلفيات مولّدة بنفس الإضاءة الدافئة — تُستخدم للمشاهد بلا فيديو، مع حركة Ken Burns.</p>
      <div className="projects" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))' }}>
        {GALLERY.map((url) => (
          <button
            key={url}
            type="button"
            onClick={() => onPick(url)}
            style={{
              padding: 0,
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)',
              overflow: 'hidden',
              background: 'var(--surface-2)',
              cursor: 'pointer',
              aspectRatio: '4 / 5',
            }}
          >
            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
          </button>
        ))}
      </div>
    </Modal>
  );
}

const PHASE_LABEL: Record<GrokPhase, string> = {
  starting: 'يُرسل الطلب إلى xAI…',
  queued: 'في طابور التوليد…',
  rendering: 'يولّد المقطع…',
  downloading: 'يُنزّل الفيديو…',
};

function GrokModal({
  scene,
  project,
  onClose,
  onReady,
}: {
  scene: Scene;
  project: Project;
  onClose: () => void;
  onReady: (blob: Blob) => Promise<void>;
}) {
  const toast = useToast();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [prompt, setPrompt] = useState(() => grokPromptFromScene(scene.visual, scene.text));
  const [duration, setDuration] = useState(6);
  const [model, setModel] = useState('grok-imagine-video-1.5-lite');
  const [phase, setPhase] = useState<GrokPhase | null>(null);
  const [ratio, setRatio] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void grokConfigured().then((value) => {
      if (alive) setConfigured(value);
    });
    return () => {
      alive = false;
    };
  }, []);

  const aspect = project.aspect;

  return (
    <Modal
      open
      onClose={onClose}
      title="توليد مقطع بـ Grok"
      wide
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            إغلاق
          </Button>
          <Button
            variant="primary"
            icon="sparkles"
            disabled={!configured || !prompt.trim() || !!phase}
            onClick={async () => {
              setError(null);
              setRatio(0);
              setPhase('starting');
              track('grok_generation_started', { scene_id: scene.id, duration, model, aspect });
              try {
                const blob = await generateGrokVideo(
                  { prompt, duration, aspect, model },
                  (nextPhase, progress) => {
                    setPhase(nextPhase);
                    setRatio(progress);
                  },
                );
                await onReady(blob);
                track('grok_generation_done', { scene_id: scene.id, bytes: blob.size, duration });
              } catch (err) {
                const message = err instanceof Error ? err.message : 'تعذّر التوليد';
                setError(message);
                toast(message, 'error');
              } finally {
                setPhase(null);
              }
            }}
          >
            {phase ? PHASE_LABEL[phase] : 'ولّد المقطع'}
          </Button>
        </>
      }
    >
      <Field label="وصف المقطع" hint="صف المشهد بصريًا. يمكن أن يكون بالإنجليزية لدقة أعلى.">
        <textarea className="textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </Field>
      <div className="row">
        <Field label="المدة">
          <select className="select" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            <option value={6}>6 ثوان</option>
            <option value={10}>10 ثوان</option>
            <option value={15}>15 ثانية</option>
          </select>
        </Field>
        <Field label="النموذج">
          <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="grok-imagine-video-1.5-lite">1.5 Lite — أسرع وأرخص</option>
            <option value="grok-imagine-video-1.5">1.5 — أعلى جودة</option>
          </select>
        </Field>
        <Field label="النسبة">
          <div className="badge">{aspect}</div>
        </Field>
      </div>

      {phase ? (
        <div className="notice">
          <Icon name="clock" size={16} />
          <span>
            {PHASE_LABEL[phase]} — قد يأخذ من دقيقة إلى بضع دقائق. اترك الصفحة مفتوحة. ({Math.round(ratio * 100)}%)
          </span>
        </div>
      ) : null}

      {error ? (
        <p className="notice" style={{ borderColor: 'rgba(255,143,128,.4)', color: 'var(--danger)' }}>
          <Icon name="info" size={16} />
          <span>{error}</span>
        </p>
      ) : null}

      {configured === false ? (
        <div className="notice">
          <Icon name="info" size={16} />
          <span>
            لا يوجد مفتاح <code>XAI_API_KEY</code> على الخادم، والخطة المجانية في Grok لا تشمل توليد الفيديو عبر API.
            الطريقة المجانية: افتح تطبيق Grok ← Imagine ← ولّد المقطع ← نزّله ← ثم «فيديو» في بطاقة المشهد لرفعه.
          </span>
        </div>
      ) : null}

      <p className="small muted">
        التوليد المباشر يُستهلك من رصيد xAI حسب مدة المقطع ونموذجه، ويُخصم من حسابك لا من التطبيق. المفتاح يبقى في
        الخادم ولا يظهر في المتصفح.
      </p>
    </Modal>
  );
}
