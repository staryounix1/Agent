import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { ASPECTS, LANGS, type View } from '../types';
import { Button, Empty, Field, Icon, Pipeline, Progress, useToast } from '../ui';
import { loadAsset, newId, putAsset } from '../lib/storage';
import { ambientBuffer, audioContext, decodeBlob } from '../lib/audio';
import { drawFrame, ensureCaptionFonts, frameOptionsFor, type VisualFrame } from '../lib/render';
import { buildTimeline, formatClock, sceneAt } from '../lib/timeline';
import { loadVisual, pauseVideos, resetVideos, syncVideos, videoFor } from '../lib/visuals';
import {
  dimensionsFor,
  downloadBlob,
  downloadText,
  exportVideo,
  pickVideoFormat,
  srtFor,
  type ExportResult,
} from '../lib/exporter';
import { track } from '../lib/analytics';

export function EditView({ onGo }: { onGo: (view: View) => void }) {
  const { state, project, updateProject, setStage, saveMusic, addExport } = useStore();
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visualsRef = useRef<Record<number, VisualFrame>>({});
  const audioRef = useRef<Record<string, Blob>>({});
  const musicBlobRef = useRef<Blob | undefined>(undefined);
  const timeRef = useRef(0);
  const graphRef = useRef<AudioBufferSourceNode[]>([]);

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [assetTick, setAssetTick] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ExportResult | null>(null);
  const musicInput = useRef<HTMLInputElement>(null);
  const format = useMemo(() => pickVideoFormat(), []);

  const scenes = project?.scenes ?? [];
  const visualKey = scenes.map((s) => `${s.videoId ?? '-'}:${s.imageId ?? '-'}`).join('|');
  const audioKey = scenes.map((s) => `${s.id}:${s.audioId ?? '-'}`).join('|');

  useEffect(() => {
    let alive = true;
    void (async () => {
      const map: Record<number, VisualFrame> = {};
      for (let i = 0; i < scenes.length; i += 1) {
        const scene = scenes[i];
        const assetId = scene.videoId ?? scene.imageId;
        if (!assetId) continue;
        const frame = await loadVisual(assetId, scene.videoId ? 'video' : 'image');
        if (frame) map[i] = frame;
      }
      if (!alive) return;
      visualsRef.current = map;
      setAssetTick((v) => v + 1);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualKey, reloadKey]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const map: Record<string, Blob> = {};
      for (const scene of scenes) {
        if (!scene.audioId) continue;
        const asset = await loadAsset(scene.audioId);
        if (asset) map[scene.id] = asset.blob;
      }
      const musicAsset = project?.music.assetId ? await loadAsset(project.music.assetId) : undefined;
      if (!alive) return;
      audioRef.current = map;
      musicBlobRef.current = musicAsset?.blob;
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioKey, project?.music.assetId]);

  const timeline = useMemo(() => {
    if (!project) return null;
    const durations: Record<string, number> = {};
    project.scenes.forEach((scene) => {
      if (scene.audioSeconds) durations[scene.id] = scene.audioSeconds;
    });
    return buildTimeline(project, durations, dimensionsFor(project).w);
  }, [project]);

  const seriesName = state.series.find((s) => s.id === project?.seriesId)?.name ?? '';

  const draw = useCallback(
    (at: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !project || !timeline) return;
      const { w, h } = dimensionsFor(project);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      drawFrame(
        ctx,
        timeline,
        at,
        frameOptionsFor(project, w, h, seriesName, (i) => visualsRef.current[i] ?? null),
      );
    },
    [project, timeline, seriesName],
  );

  useEffect(() => {
    void ensureCaptionFonts().then(() => draw(timeRef.current));
  }, [draw, assetTick]);

  const stopAudio = useCallback(() => {
    graphRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        /* انتهى */
      }
    });
    graphRef.current = [];
  }, []);

  const startAudio = useCallback(
    async (from: number) => {
      if (!project || !timeline) return;
      stopAudio();
      try {
        const ctx = audioContext();
        if (ctx.state === 'suspended') await ctx.resume();
        const startAt = ctx.currentTime + 0.06;
        const sources: AudioBufferSourceNode[] = [];
        for (const timed of timeline.scenes) {
          const blob = audioRef.current[timed.scene.id];
          if (!blob || timed.end <= from) continue;
          const buffer = await decodeBlob(blob);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start(startAt + Math.max(0, timed.start - from), Math.max(0, from - timed.start));
          sources.push(source);
        }
        if (project.music.source !== 'none') {
          const buffer = musicBlobRef.current ? await decodeBlob(musicBlobRef.current) : await ambientBuffer();
          if (buffer) {
            const music = ctx.createBufferSource();
            music.buffer = buffer;
            music.loop = true;
            const gain = ctx.createGain();
            gain.gain.value = Math.min(1, project.music.volume) * 0.5;
            music.connect(gain);
            gain.connect(ctx.destination);
            music.start(startAt, from % buffer.duration);
            sources.push(music);
          }
        }
        graphRef.current = sources;
      } catch {
        /* الصوت إضافة، لا نُفشل المعاينة */
      }
    },
    [project, timeline, stopAudio],
  );

  const syncMedia = useCallback(
    (at: number, isPlaying: boolean) => {
      if (!timeline) return;
      const active = sceneAt(timeline, at);
      if (!active) return;
      syncVideos(timeline.scenes.map((timed) => timed.scene), active.index, at - active.start, isPlaying);
    },
    [timeline],
  );

  const seek = (value: number) => {
    timeRef.current = value;
    setTime(value);
    syncMedia(value, playing);
    draw(value);
    if (playing) void startAudio(value);
  };

  useEffect(() => {
    if (!playing || !timeline) return;
    const from = timeRef.current >= timeline.duration - 0.05 ? 0 : timeRef.current;
    if (from !== timeRef.current) {
      timeRef.current = from;
      setTime(from);
    }
    let raf = 0;
    const startedAt = performance.now();
    void startAudio(from);
    track('preview_played', { project_id: project?.id, from: Math.round(from) });
    const tick = () => {
      const at = from + (performance.now() - startedAt) / 1000;
      if (at >= timeline.duration) {
        timeRef.current = timeline.duration;
        setTime(timeline.duration);
        syncMedia(timeline.duration, false);
        draw(timeline.duration);
        setPlaying(false);
        stopAudio();
        return;
      }
      timeRef.current = at;
      setTime(at);
      syncMedia(at, true);
      draw(at);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      stopAudio();
      pauseVideos();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(() => {
    if (!playing) draw(timeRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.captions, project?.music, assetTick, audioKey, draw]);

  if (!project || !timeline) {
    return (
      <div className="main__inner">
        <Empty
          icon="film"
          title="لا مشروع مفتوح"
          body="افتح مشروعًا لترى التركيب والترجمة والموسيقى، ثم تصدّر الفيديو."
          action={
            <Button variant="primary" icon="layers" onClick={() => onGo('projects')}>
              إلى المشاريع
            </Button>
          }
        />
      </div>
    );
  }

  const aspect = ASPECTS.find((a) => a.id === project.aspect) ?? ASPECTS[0];
  const durations: Record<string, number> = {};
  project.scenes.forEach((scene) => {
    if (scene.audioSeconds) durations[scene.id] = scene.audioSeconds;
  });

  const runExport = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setExporting(true);
    setProgress(0);
    setResult(null);
    setPlaying(false);
    track('export_started', { project_id: project.id, aspect: project.aspect, seconds: Math.round(timeline.duration) });
    try {
      const output = await exportVideo({
        project,
        seriesName,
        canvas,
        getVisual: (i) => visualsRef.current[i] ?? null,
        getVideo: (i) => videoFor(project.scenes[i]?.videoId),
        includeVideoAudio: project.videoAudio !== false,
        syncMedia: (at, activeIndex) => {
          const timed = timeline.scenes[activeIndex];
          if (!timed) return;
          syncVideos(
            timeline.scenes.map((entry) => entry.scene),
            activeIndex,
            at - timed.start,
            true,
          );
        },
        audioBlobs: audioRef.current,
        audioDurations: durations,
        musicBlob: project.music.source === 'upload' ? musicBlobRef.current : undefined,
        onProgress: (ratio) => setProgress(ratio),
      });
      setResult(output);
      setStage(project.id, 'ready');
      const videoId = newId('vd');
      await putAsset({
        id: videoId,
        kind: 'video',
        name: output.filename,
        mime: output.format.mime,
        blob: output.blob,
        duration: output.duration,
        createdAt: Date.now(),
      });
      addExport(project.id, {
        id: videoId,
        name: output.filename,
        bytes: output.blob.size,
        duration: output.duration,
        createdAt: Date.now(),
      });
      updateProject(project.id, (p) => ({
        ...p,
        exportCount: p.exportCount + 1,
        stage: 'ready',
        meta: p.meta ?? null,
      }));
      track('export_completed', {
        project_id: project.id,
        mime: output.format.mime,
        is_mp4: output.format.isMp4,
        bytes: output.blob.size,
        seconds: Math.round(output.duration),
        has_audio: output.hasAudio,
      });
      toast(
        output.hasAudio
          ? 'الفيديو جاهز بالصوت — نزّله أو انسخ نص النشر'
          : `الفيديو جاهز — ${output.mutedReason ?? 'بلا صوت'} وتقدر تسجّل تعليقك من هنا`,
        output.hasAudio ? 'ok' : 'error',
      );
      setProgress(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'تعذّر التصدير';
      toast(message, 'error');
    } finally {
      setExporting(false);
      pauseVideos();
      resetVideos();
      setReloadKey((v) => v + 1);
    }
  };

  return (
    <div className="main__inner">
      <header className="viewhead">
        <div className="viewhead__text">
          <p className="eyebrow">الخطوة ٣ — المونتاج</p>
          <h1>التركيب والترجمة</h1>
          <p className="muted">
            {project.scenes.length} مشاهد · {formatClock(timeline.duration)} · {aspect.label} ·{' '}
            {LANGS.find((l) => l.id === project.lang)?.native}
          </p>
        </div>
        <div className="viewhead__actions">
          <Button
            size="sm"
            icon="download"
            onClick={() => {
              downloadText(srtFor(project, durations), 'captions.srt', 'application/x-subrip;charset=utf-8');
              track('captions_downloaded', { project_id: project.id, cues: timeline.cues.length });
              toast('نُزّلت الترجمة SRT');
            }}
          >
            ترجمة SRT
          </Button>
          <Button variant="primary" icon="send" onClick={() => onGo('publish')}>
            النشر
          </Button>
        </div>
      </header>

      <Pipeline
        stage={project.stage}
        onSelect={(stage) =>
          onGo(stage === 'script' || stage === 'idea' ? 'script' : stage === 'assets' ? 'scenes' : stage === 'ready' ? 'publish' : 'edit')
        }
      />

      <div className="editor">
        <div className="stage-box">
          <div className={`canvas-shell ${project.aspect === '9:16' ? 'is-portrait' : ''}`}>
            <canvas ref={canvasRef} aria-label="معاينة الفيديو" />
          </div>

          <div className="playerbar">
            <button
              type="button"
              className="playbtn"
              aria-label={playing ? 'إيقاف' : 'تشغيل المعاينة'}
              onClick={() => setPlaying((v) => !v)}
            >
              <Icon name={playing ? 'pause' : 'play'} size={18} />
            </button>
            <span className="time num">
              {formatClock(time)} / {formatClock(timeline.duration)}
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(0.1, timeline.duration)}
              step={0.05}
              value={Math.min(time, timeline.duration)}
              aria-label="موضع التشغيل"
              onChange={(e) => seek(Number(e.target.value))}
            />
            <span className="badge num">{timeline.cues.length} ترجمة</span>
          </div>

          {result ? (
            <div className="export-result">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="check" size={18} />
                <strong>تم التصدير — {result.format.label}</strong>
              </div>
              <p className="small" style={{ color: 'var(--muted)' }}>
                {(result.blob.size / 1_000_000).toFixed(1)} ميغابايت · {formatClock(result.duration)}
                {result.format.isMp4
                  ? ' · MP4 جاهز للنشر مباشرة'
                  : ' · متصفحك لا يدعم MP4 مباشرة، الملف WebM (يعمل على يوتيوب وتيك توك وفيسبوك).'}
              </p>
              <div className="viewhead__actions">
                <Button
                  variant="primary"
                  icon="download"
                  onClick={() => downloadBlob(result.blob, result.filename)}
                >
                  تنزيل الفيديو
                </Button>
                <Button icon="send" onClick={() => onGo('publish')}>
                  نص النشر
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="settings-pane">
          <div className="settings-group">
            <span className="settings-group__title">
              <Icon name="script" size={15} /> الترجمة
            </span>
            <label className="switch">
              <span>إظهار الترجمة داخل الفيديو</span>
              <input
                type="checkbox"
                checked={project.captions.enabled}
                onChange={(e) =>
                  updateProject(project.id, (p) => ({ ...p, captions: { ...p.captions, enabled: e.target.checked } }))
                }
              />
              <span className="switch__track" aria-hidden="true" />
            </label>
            <Field label={`حجم الخط: ${Math.round(project.captions.size * 100)}%`}>
              <input
                type="range"
                min={0.75}
                max={1.4}
                step={0.05}
                value={project.captions.size}
                onChange={(e) =>
                  updateProject(project.id, (p) => ({ ...p, captions: { ...p.captions, size: Number(e.target.value) } }))
                }
                disabled={!project.captions.enabled}
              />
            </Field>
            <p className="small muted">
              اللغة {LANGS.find((l) => l.id === project.lang)?.native} — اتجاه النص يتبع اللغة، وخط Cairo يغطي
              العربية والفرنسية والإنجليزية.
            </p>
          </div>

          <div className="settings-group">
            <span className="settings-group__title">
              <Icon name="music" size={15} /> الموسيقى
            </span>
            <div className="segmented" role="group" aria-label="مصدر الموسيقى">
              <button
                type="button"
                className={project.music.source === 'none' ? 'is-active' : ''}
                onClick={() => updateProject(project.id, (p) => ({ ...p, music: { ...p.music, source: 'none' } }))}
              >
                بدون
              </button>
              <button
                type="button"
                className={project.music.source === 'builtin' ? 'is-active' : ''}
                onClick={() => updateProject(project.id, (p) => ({ ...p, music: { ...p.music, source: 'builtin' } }))}
              >
                نغمة هادئة
              </button>
              <button
                type="button"
                className={project.music.source === 'upload' ? 'is-active' : ''}
                onClick={() => musicInput.current?.click()}
              >
                ملفّي
              </button>
            </div>
            <input
              ref={musicInput}
              type="file"
              accept="audio/*"
              className="hidden-input"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                await saveMusic(project.id, file, file.name);
                toast('أُضيفت الموسيقى');
              }}
            />
            <Field label={`مستوى الموسيقى: ${Math.round(project.music.volume * 100)}%`}>
              <input
                type="range"
                min={0}
                max={0.8}
                step={0.02}
                value={project.music.volume}
                onChange={(e) =>
                  updateProject(project.id, (p) => ({ ...p, music: { ...p.music, volume: Number(e.target.value) } }))
                }
                disabled={project.music.source === 'none'}
              />
            </Field>
            <p className="small muted">
              «نغمة هادئة» تُولَّد داخل التطبيق لحظيًا — بلا ملفات خارجية ولا حقوق.
            </p>
            <label className="switch">
              <span>صوت الفيديو الأصلي (من Grok)</span>
              <input
                type="checkbox"
                checked={project.videoAudio !== false}
                onChange={(e) => updateProject(project.id, (p) => ({ ...p, videoAudio: e.target.checked }))}
              />
              <span className="switch__track" aria-hidden="true" />
            </label>
            <p className="small muted">يُدمج إلى جانب التسجيل والصوت والموسيقى عند التصدير.</p>
          </div>

          <div className="settings-group">
            <span className="settings-group__title">
              <Icon name="download" size={15} /> التصدير
            </span>
            <div className="badge num">
              {aspect.w}×{aspect.h} · {format ? format.label : 'غير مدعوم'}
            </div>
            {!format ? (
              <p className="notice">
                <Icon name="info" size={16} />
                <span>هذا المتصفح لا يدعم تسجيل الفيديو. جرّب Chrome أو Edge.</span>
              </p>
            ) : null}
            {exporting ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <Progress value={progress} label="تقدّم التصدير" />
                <span className="small muted num">
                  يصدّر… {Math.round(progress * 100)}% — ابقَ في التطبيق حتى ينتهي
                </span>
              </div>
            ) : (
              <Button variant="primary" block icon="download" onClick={runExport} disabled={!format}>
                {result ? 'تصدير مرة أخرى' : 'تصدير الفيديو'}
              </Button>
            )}
            <p className="small muted">
              التصدير يسجّل المعاينة نفسها في الوقت الحقيقي (ثانية بثانية)، والصوت يُركَّب تلقائيًا مع المشاهد.
            </p>
          </div>

          <div className="settings-group">
            <span className="settings-group__title">
              <Icon name="image" size={15} /> المشاهد
            </span>
            <p className="small muted">
              {project.scenes.filter((s) => s.imageId).length}/{project.scenes.length} صورة ·{' '}
              {project.scenes.filter((s) => s.audioId).length}/{project.scenes.length} صوت
            </p>
            <Button size="sm" icon="pencil" onClick={() => onGo('scenes')}>
              تعديل الصور والأصوات
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
