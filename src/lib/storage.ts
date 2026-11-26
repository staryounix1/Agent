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
      req.onerror = () => reject(req.error);
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
  await withStore('readwrite', (store) => store.delete(id));
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
