import { ASPECTS, type Project } from '../types';
import { ambientBuffer, audioContext, decodeBlob } from './audio';
import { ensureCaptionFonts, frameOptionsFor, type VisualFrame } from './render';
import { buildSrt, buildTimeline, sceneAt, audioSchedule, type Timeline } from './timeline';
import { drawFrame } from './render';

export interface VideoFormat {
  mime: string;
  ext: string;
  isMp4: boolean;
  label: string;
}

/** مهلة واحدة للصورة والصوت حتى يبدآن معًا. */
export const LEAD_SECONDS = 0.12;

const CANDIDATES: VideoFormat[] = [
  { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4', isMp4: true, label: 'MP4 / H.264' },
  { mime: 'video/mp4;codecs=avc1.42E01E', ext: 'mp4', isMp4: true, label: 'MP4 / H.264' },
  { mime: 'video/mp4', ext: 'mp4', isMp4: true, label: 'MP4' },
  { mime: 'video/webm;codecs=vp9,opus', ext: 'webm', isMp4: false, label: 'WebM / VP9' },
  { mime: 'video/webm;codecs=vp8,opus', ext: 'webm', isMp4: false, label: 'WebM / VP8' },
  { mime: 'video/webm', ext: 'webm', isMp4: false, label: 'WebM' },
];

export function pickVideoFormat(): VideoFormat | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate.mime)) ?? null;
}

export function dimensionsFor(project: Project): { w: number; h: number } {
  const aspect = ASPECTS.find((a) => a.id === project.aspect) ?? ASPECTS[0];
  return { w: aspect.w, h: aspect.h };
}

export function timelineFor(project: Project, audioDurations: Record<string, number>): Timeline {
  const { w } = dimensionsFor(project);
  return buildTimeline(project, audioDurations, w);
}

export function srtFor(project: Project, audioDurations: Record<string, number>): string {
  return buildSrt(timelineFor(project, audioDurations));
}

export function slugify(text: string): string {
  const base = text
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return base || 'mashhad-video';
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadText(text: string, filename: string, mime = 'text/plain;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

export interface ExportInput {
  project: Project;
  seriesName: string;
  canvas: HTMLCanvasElement;
  getVisual: (index: number) => VisualFrame | null;
  getVideo?: (index: number) => HTMLVideoElement | null;
  syncMedia?: (time: number, index: number, playing: boolean) => void;
  includeVideoAudio?: boolean;
  audioBlobs: Record<string, Blob>;
  audioDurations: Record<string, number>;
  musicBlob?: Blob;
  onProgress: (ratio: number, seconds: number) => void;
}

export interface ExportResult {
  blob: Blob;
  format: VideoFormat;
  duration: number;
  filename: string;
  /** هل الفيديو فيه صوت مسموع فعلًا. */
  hasAudio: boolean;
  /** سبب غياب الصوت، إن غاب. */
  mutedReason?: string;
}

export async function exportVideo(input: ExportInput): Promise<ExportResult> {
  const { project, canvas, getVisual, audioBlobs, audioDurations, musicBlob, onProgress } = input;
  const format = pickVideoFormat();
  if (!format) {
    throw new Error('هذا المتصفح لا يدعم تسجيل الفيديو. جرّب Chrome أو Edge على الهاتف أو الحاسوب.');
  }
  if (typeof canvas.captureStream !== 'function') {
    throw new Error('هذا المتصفح لا يوفّر captureStream. جرّب Chrome أو Edge.');
  }
  const { w, h } = dimensionsFor(project);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذّر تهيئة لوحة الرسم');

  await ensureCaptionFonts();
  const timeline = buildTimeline(project, audioDurations, w);
  const opts = frameOptionsFor(project, w, h, input.seriesName, getVisual);
  drawFrame(ctx, timeline, 0, opts);

  const videoStream = canvas.captureStream(30);
  const sources: AudioBufferSourceNode[] = [];
  let audioStream: MediaStream | null = null;
  let actx: AudioContext | null = null;
  let destination: MediaStreamAudioDestinationNode | null = null;
  let musicBuffer: AudioBuffer | null = null;
  const narration: { sceneId: string; buffer: AudioBuffer }[] = [];
  let mutedReason: string | undefined;

  // أولًا: نفك ترميز كل الملفات قبل بدء التسجيل حتى يبدأ الصوت مع الصورة لا بعدها.
  try {
    actx = audioContext();
    if (actx.state === 'suspended') await actx.resume();
    destination = actx.createMediaStreamDestination();
  } catch {
    mutedReason = 'تعذّر تشغيل محرّك الصوت في هذا المتصفح، فخرج الفيديو صامتًا.';
  }

  if (destination) {
    let failed = 0;
    for (const timed of timeline.scenes) {
      const blob = audioBlobs[timed.scene.id];
      if (!blob) continue;
      try {
        narration.push({ sceneId: timed.scene.id, buffer: await decodeBlob(blob) });
      } catch {
        failed += 1;
      }
    }
    if (failed && !narration.length) mutedReason = 'ملفات التعليق الصوتي غير مقروءة، فخرج الفيديو بلا تعليق.';
    else if (failed) mutedReason = `${failed} مقطع صوتي ما تفكّش ترميزه، وباقي التعليق موجود.`;

    if (project.music.source !== 'none') {
      try {
        musicBuffer = musicBlob ? await decodeBlob(musicBlob) : await ambientBuffer();
      } catch {
        /* الموسيقى اختيارية */
      }
    }
    if (!narration.length && !musicBuffer && !input.includeVideoAudio)
      mutedReason = 'ما فيهاش تعليق صوتي جاهز، فالفيديو صامت.';
  }

  // المسار الصوتي يدخل الستريم قبل بدء التسجيل: كروم يرفض إضافة مسارات أثناء التسجيل
  // («Tracks in MediaStream were added») ويخرج الملف فارغًا.
  const tracks = [...videoStream.getVideoTracks()];
  if (destination) tracks.push(...destination.stream.getAudioTracks());
  const stream = new MediaStream(tracks);
  const recorder = new MediaRecorder(stream, { mimeType: format.mime, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  let recorderError: string | null = null;
  recorder.onerror = (event) => {
    const error = (event as Event & { error?: DOMException }).error;
    recorderError = error?.message || 'خطأ غير معروف في المسجّل';
  };

  const scheduleAudio = () => {
    if (!actx || !destination) return;
    const startAt = actx.currentTime + LEAD_SECONDS;
    for (const slot of audioSchedule(timeline, startAt)) {
      const item = narration.find((entry) => entry.sceneId === slot.sceneId);
      if (!item) continue;
      try {
        const source = actx.createBufferSource();
        source.buffer = item.buffer;
        const gain = actx.createGain();
        gain.gain.value = 1;
        source.connect(gain);
        gain.connect(destination);
        source.start(slot.at);
        sources.push(source);
      } catch {
        /* مصدر واحد فشل: نكمل بالباقي */
      }
    }
    if (musicBuffer) {
      try {
        const music = actx.createBufferSource();
        music.buffer = musicBuffer;
        music.loop = true;
        const gain = actx.createGain();
        gain.gain.value = Math.min(1, Math.max(0, project.music.volume)) * 0.55;
        music.connect(gain);
        gain.connect(destination);
        music.start(startAt);
        music.stop(startAt + timeline.duration + 0.4);
        sources.push(music);
      } catch {
        /* الموسيقى اختيارية */
      }
    }
    if (input.includeVideoAudio && input.getVideo) {
      for (const timed of timeline.scenes) {
        const video = input.getVideo(timed.index);
        if (!video) continue;
        try {
          video.muted = false;
          const source = actx.createMediaElementSource(video);
          const gain = actx.createGain();
          gain.gain.value = 1;
          source.connect(gain);
          gain.connect(destination);
        } catch {
          video.muted = true;
        }
      }
    }
    if (sources.length) audioStream = destination.stream;
  };

  const cleanup = () => {
    sources.forEach((source) => {
      try {
        source.stop();
      } catch {
        /* انتهى تلقائيًا */
      }
    });
    stream.getTracks().forEach((track) => track.stop());
    if (actx && actx.state !== 'closed') void actx.close();
  };

  return new Promise<ExportResult>((resolve, reject) => {
    let raf = 0;
    let startedAt = 0;

    recorder.onstop = () => {
      cancelAnimationFrame(raf);
      cleanup();
      const blob = new Blob(chunks, { type: format.mime });
      if (!blob.size) {
        reject(
          new Error(
            recorderError
              ? `توقّف التسجيل: ${recorderError}`
              : 'خرج التسجيل فارغًا، أعد المحاولة.',
          ),
        );
        return;
      }
      resolve({
        blob,
        format,
        duration: timeline.duration,
        filename: `${slugify(project.title)}.${format.ext}`,
        hasAudio: Boolean(audioStream),
        mutedReason: audioStream ? undefined : mutedReason,
      });
    };

    const tick = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const time = Math.min(timeline.duration, Math.max(0, elapsed));
      input.syncMedia?.(time, sceneAt(timeline, time)?.index ?? 0, true);
      drawFrame(ctx, timeline, time, opts);
      onProgress(timeline.duration ? time / timeline.duration : 0, time);
      if (elapsed >= timeline.duration + 0.18) {
        input.syncMedia?.(timeline.duration, timeline.scenes.length - 1, false);
        if (recorder.state !== 'inactive') recorder.stop();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    try {
      recorder.start(500);
      scheduleAudio();
      // نفس مهلة الصوت تُطبَّق على الصورة، فلا يتقدّم الصوت عن الصورة ولا يتأخر.
      startedAt = performance.now() + LEAD_SECONDS * 1000;
      raf = requestAnimationFrame(tick);
    } catch (err) {
      cleanup();
      reject(err instanceof Error ? err : new Error('تعذّر بدء التسجيل'));
    }
  });
}
