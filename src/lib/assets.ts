import type { Project } from '../types';

/** سقف الفيديوهات المصدرة المحفوظة لكل مشروع: الأقدم يُمسح حتى ما تمتلئ ذاكرة الهاتف. */
export const MAX_EXPORTS = 3;

export interface AssetRef {
  id: string;
  createdAt?: number;
  bytes?: number;
}

/** كل معرّف أصل يستعمله المشروع فعلًا (صور، صوت، موسيقى، فيديوهات مصدرة). */
export function referencedAssetIds(project: Project): string[] {
  const ids: string[] = [];
  for (const scene of project.scenes) {
    if (scene.imageId) ids.push(scene.imageId);
    if (scene.videoId) ids.push(scene.videoId);
    if (scene.audioId) ids.push(scene.audioId);
  }
  if (project.music.assetId) ids.push(project.music.assetId);
  for (const item of project.exports ?? []) ids.push(item.id);
  return ids;
}

/** أصول ما يستعملها أي مشروع — تُمسح بأمان. */
export function orphanAssetIds(assets: AssetRef[], projects: Project[]): string[] {
  const used = new Set(projects.flatMap(referencedAssetIds));
  return assets.filter((asset) => !used.has(asset.id)).map((asset) => asset.id);
}

/** يُبقي أحدث MAX_EXPORTS ويُعيد الأقدم للمسح. */
export function exportsToDrop(project: Project, max = MAX_EXPORTS): string[] {
  const exports = project.exports ?? [];
  if (exports.length <= max) return [];
  return [...exports]
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, exports.length - max)
    .map((item) => item.id);
}

/** أي أصول يجب مسحها عند حذف مشروع: كل مراجعه. */
export function assetIdsOfProject(project: Project): string[] {
  return referencedAssetIds(project);
}

export function totalBytes(assets: AssetRef[]): number {
  return assets.reduce((sum, asset) => sum + (asset.bytes ?? 0), 0);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 م.ب';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} ك.ب`;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} م.ب`;
  return `${(mb / 1024).toFixed(1)} غ.ب`;
}
