import type { AppState, Asset } from '../types';

const STATE_KEY = 'mashhad.state.v1';
const DB_NAME = 'mashhad-media';
const STORE = 'assets';

export const EMPTY_STATE: AppState = { version: 1, series: [], projects: [], selectedId: null };

function isState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false;
  const v = value as AppState;
  return v.version === 1 && Array.isArray(v.series) && Array.isArray(v.projects);
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed: unknown = JSON.parse(raw);
    if (!isState(parsed)) return EMPTY_STATE;
    return { ...parsed, selectedId: parsed.selectedId ?? null };
  } catch {
    return EMPTY_STATE;
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('تعذّر حفظ الحالة محليًا', err);
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      // فشل واحد (مثل وضع التصفح الخاص) لا يُثبَّت للأبد: المحاولة القادمة تعيد الفتح.
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
      req.onblocked = () => {
        dbPromise = null;
        reject(new Error('قاعدة البيانات مشغولة في تبويب آخر'));
      };
    });
  }
  return dbPromise;
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = run(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putAsset(asset: Asset): Promise<void> {
  await withStore('readwrite', (store) => store.put(asset));
}

export async function getAsset(id: string): Promise<Asset | undefined> {
  return withStore('readonly', (store) => store.get(id) as IDBRequest<Asset | undefined>);
}

export async function deleteAsset(id: string): Promise<void> {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
  assetCache.delete(id);
  await withStore('readwrite', (store) => store.delete(id));
}

/** يمسح مجموعة أصول ويعيد عدد ما مُسح فعلًا (بلا توقف عند أول فشل). */
export async function deleteAssets(ids: string[]): Promise<number> {
  let removed = 0;
  for (const id of new Set(ids)) {
    try {
      await deleteAsset(id);
      removed += 1;
    } catch {
      /* أصل واحد فشل مسحه: نكمل الباقي */
    }
  }
  return removed;
}

export async function allAssets(): Promise<Asset[]> {
  return withStore('readonly', (store) => store.getAll() as IDBRequest<Asset[]>);
}

/** المساحة المستعملة على الجهاز للفيديوهات والصور، ونسبة ما تسمح به المتصفح. */
export async function storageUsage(): Promise<{ used: number; quota: number; files: number }> {
  let assets: Asset[] = [];
  try {
    assets = await allAssets();
  } catch {
    assets = [];
  }
  const used = assets.reduce((sum, asset) => sum + (asset.blob?.size ?? 0), 0);
  let quota = 0;
  try {
    const estimate = await navigator.storage?.estimate?.();
    quota = estimate?.quota ?? 0;
  } catch {
    quota = 0;
  }
  return { used, quota, files: assets.length };
}

const urlCache = new Map<string, string>();
const assetCache = new Map<string, Asset>();

export async function loadAsset(id: string): Promise<Asset | undefined> {
  const cached = assetCache.get(id);
  if (cached) return cached;
  const asset = await getAsset(id);
  if (asset) assetCache.set(id, asset);
  return asset;
}

export async function assetUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const asset = await loadAsset(id);
  if (!asset) return null;
  const url = URL.createObjectURL(asset.blob);
  urlCache.set(id, url);
  assetCache.set(id, asset);
  return url;
}

export function cachedAsset(id: string): Asset | undefined {
  return assetCache.get(id);
}

const imageCache = new Map<string, HTMLImageElement>();

export function imageFor(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error('تعذّر تحميل الصورة'));
    img.src = src;
  });
}

export async function assetImage(id: string): Promise<HTMLImageElement | null> {
  const url = await assetUrl(id);
  if (!url) return null;
  try {
    return await imageFor(url);
  } catch {
    return null;
  }
}

export function newId(prefix: string): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}
