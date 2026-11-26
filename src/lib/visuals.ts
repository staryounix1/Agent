import { assetUrl } from './storage';
import type { VisualFrame } from './render';

const images = new Map<string, HTMLImageElement>();
const videos = new Map<string, HTMLVideoElement>();
const pending = new Map<string, Promise<VisualFrame | null>>();

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('تعذّر تحميل الصورة'));
    img.src = url;
  });
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('playsinline', '');
    const done = () => resolve(video);
    video.onloadeddata = done;
    video.oncanplay = done;
    video.onerror = () => reject(new Error('تعذّر تحميل الفيديو'));
    video.load();
  });
}

export function peekVisual(assetId?: string | null): VisualFrame | null {
  if (!assetId) return null;
  const image = images.get(assetId);
  if (image) return { kind: 'image', source: image, width: image.naturalWidth, height: image.naturalHeight };
  const video = videos.get(assetId);
  if (video && video.videoWidth) {
    return { kind: 'video', source: video, width: video.videoWidth, height: video.videoHeight };
  }
  return null;
}

export function videoFor(assetId?: string | null): HTMLVideoElement | null {
  if (!assetId) return null;
  return videos.get(assetId) ?? null;
}

export async function loadVisual(assetId: string, kind: 'image' | 'video'): Promise<VisualFrame | null> {
  const existing = peekVisual(assetId);
  if (existing) return existing;
  const inflight = pending.get(assetId);
  if (inflight) return inflight;

  const task = (async (): Promise<VisualFrame | null> => {
    const url = await assetUrl(assetId);
    if (!url) return null;
    try {
      if (kind === 'video') {
        const video = videos.get(assetId) ?? (await loadVideo(url));
        videos.set(assetId, video);
        return { kind: 'video', source: video, width: video.videoWidth, height: video.videoHeight };
      }
      const image = images.get(assetId) ?? (await loadImage(url));
      images.set(assetId, image);
      return { kind: 'image', source: image, width: image.naturalWidth, height: image.naturalHeight };
    } catch {
      return null;
    } finally {
      pending.delete(assetId);
    }
  })();

  pending.set(assetId, task);
  return task;
}

export async function probeVideo(blob: Blob): Promise<{ duration: number; width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const video = await loadVideo(url);
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const size = { duration, width: video.videoWidth, height: video.videoHeight };
    video.removeAttribute('src');
    video.load();
    return size;
  } catch {
    return { duration: 0, width: 0, height: 0 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function pauseVideos(): void {
  videos.forEach((video) => video.pause());
}

export function resetVideos(): void {
  videos.forEach((video) => {
    video.pause();
    video.removeAttribute('src');
    video.load();
  });
  videos.clear();
  pending.clear();
}

/** يزامن عناصر الفيديو مع زمن المعاينة: المشهد الحالي يعمل والباقي متوقف. */
export function syncVideos(
  scenes: { videoId?: string }[],
  activeIndex: number,
  localTime: number,
  playing: boolean,
): void {
  scenes.forEach((scene, index) => {
    const video = scene.videoId ? videos.get(scene.videoId) : undefined;
    if (!video) return;
    if (index !== activeIndex) {
      if (!video.paused) video.pause();
      return;
    }
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 6;
    const target = ((localTime % duration) + duration) % duration;
    if (Math.abs(video.currentTime - target) > 0.28) {
      try {
        video.currentTime = target;
      } catch {
        /* لم تجهز البيانات بعد */
      }
    }
    if (playing) {
      if (video.paused) void video.play().catch(() => undefined);
    } else if (!video.paused) {
      video.pause();
    }
  });
}
