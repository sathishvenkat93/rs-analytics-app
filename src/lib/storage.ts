import type { ChartConfig, DashboardDoc, Dataset } from '../types';

/**
 * Persists the workspace in IndexedDB (localStorage's ~5 MB cap is too small
 * for real spreadsheets). Everything stays in this browser.
 */
export interface Workspace {
  datasets: Dataset[];
  dashboards: DashboardDoc[];
  activeDashboardId: string | null;
  /** v1 kept a single list of charts; read for migration only. */
  charts?: ChartConfig[];
}

const DB_NAME = 'rs-analytics';
const STORE = 'workspace';
const KEY = 'current';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadWorkspace(): Promise<Workspace | null> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as Workspace | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function saveWorkspace(ws: Workspace): Promise<boolean> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(ws, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

const THEME_KEY = 'rs-analytics:theme';
export type ThemePref = 'system' | 'light' | 'dark';

export function loadThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function saveThemePref(v: ThemePref): void {
  try {
    localStorage.setItem(THEME_KEY, v);
  } catch {
    /* per-viewer convenience only */
  }
}
