import type { AppState, Asset, Project, Series } from '../types';
import { allAssets, putAsset } from './storage';
import { assetIdsOfProject } from './assets';
import { base64ToBytes, bytesToBase64 } from './binary';

export const BACKUP_APP = 'mashhad';
export const BACKUP_VERSION = 1;
/** سقف حجم النسخة: ما بعدها يفشل في فتحه الهاتف على نحو موثوق. */
export const MAX_BACKUP_BYTES = 80 * 1024 * 1024;

interface PackedAsset {
  id: string;
  kind: Asset['kind'];
  name: string;
  mime: string;
  width?: number;
  height?: number;
  duration?: number;
  createdAt: number;
  data: string;
}

export interface BackupFile {
  app: string;
  version: number;
  exportedAt: number;
  series: Series[];
  projects: Project[];
  assets: PackedAsset[];
}

export async function exportBackup(state: AppState): Promise<{ blob: Blob; file: BackupFile; skipped: number }> {
  const wanted = new Set(state.projects.flatMap(assetIdsOfProject));
  const known = new Map((await allAssets().catch(() => [] as Asset[])).map((asset) => [asset.id, asset]));
  const assets: PackedAsset[] = [];
  let total = 0;
  let skipped = 0;
  for (const id of wanted) {
    const asset = known.get(id);
    if (!asset?.blob) continue;
    if (total + asset.blob.size > MAX_BACKUP_BYTES) {
      skipped += 1;
      continue;
    }
    const bytes = new Uint8Array(await asset.blob.arrayBuffer());
    total += asset.blob.size;
    assets.push({
      id: asset.id,
      kind: asset.kind,
      name: asset.name,
      mime: asset.mime,
      width: asset.width,
      height: asset.height,
      duration: asset.duration,
      createdAt: asset.createdAt,
      data: bytesToBase64(bytes),
    });
  }
  const file: BackupFile = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    series: state.series,
    projects: state.projects,
    assets,
  };
  return { blob: new Blob([JSON.stringify(file)], { type: 'application/json' }), file, skipped };
}

export interface ImportResult {
  state: AppState;
  projects: number;
  assets: number;
  skipped: number;
}

export function parseBackup(raw: string): BackupFile {
  const parsed = JSON.parse(raw) as Partial<BackupFile>;
  if (parsed.app !== BACKUP_APP) throw new Error('هذا الملف ليس نسخة من «مشهد»');
  if (parsed.version !== BACKUP_VERSION) throw new Error(`نسخة غير مدعومة (الإصدار ${String(parsed.version)})`);
  if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.assets)) throw new Error('الملف ناقص أو تالف');
  return {
    app: parsed.app,
    version: parsed.version,
    exportedAt: parsed.exportedAt ?? Date.now(),
    series: Array.isArray(parsed.series) ? parsed.series : [],
    projects: parsed.projects,
    assets: parsed.assets,
  };
}

/** يدمج نسخة احتياطية مع الحالة الحالية: يتخطى المعرّفات الموجودة ولا يمسح شيئًا. */
export async function importBackup(raw: string, current: AppState): Promise<ImportResult> {
  const file = parseBackup(raw);
  const existing = new Map((await allAssets().catch(() => [] as Asset[])).map((asset) => [asset.id, asset]));
  let assets = 0;
  let skipped = 0;
  for (const packed of file.assets) {
    if (!packed?.id || typeof packed.data !== 'string') {
      skipped += 1;
      continue;
    }
    if (existing.has(packed.id)) continue;
    const bytes = base64ToBytes(packed.data);
    const asset: Asset = {
      id: packed.id,
      kind: packed.kind,
      name: packed.name ?? packed.id,
      mime: packed.mime ?? 'application/octet-stream',
      blob: new Blob([bytes], { type: packed.mime ?? 'application/octet-stream' }),
      width: packed.width,
      height: packed.height,
      duration: packed.duration,
      createdAt: packed.createdAt ?? Date.now(),
    };
    await putAsset(asset);
    assets += 1;
  }

  const haveProjects = new Set(current.projects.map((project) => project.id));
  const haveSeries = new Set(current.series.map((item) => item.id));
  const projects = file.projects.filter((project) => !haveProjects.has(project.id));
  const series = file.series.filter((item) => !haveSeries.has(item.id));
  return {
    state: {
      ...current,
      series: [...current.series, ...series],
      projects: [...current.projects, ...projects],
      selectedId: current.selectedId,
    },
    projects: projects.length,
    assets,
    skipped,
  };
}
