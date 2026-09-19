import type { CurveData, ReviewResolution } from "./audiology";

export interface Version {
  id: string;
  versionNo: number;
  createdAt: string;
  reason: string;
  data: CurveData;
  resolvedReviews: Record<string, ReviewResolution>;
}

export interface Store {
  versions: Version[];
  draft: CurveData | null;
  draftResolved: Record<string, ReviewResolution>;
}

const STORAGE_KEY = "hxwl-01:hearing-store:v1";

export function loadStore(): Store | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Store>;
    if (!parsed || !Array.isArray(parsed.versions)) return null;
    return {
      versions: parsed.versions as Version[],
      draft: parsed.draft ?? null,
      draftResolved: parsed.draftResolved ?? {},
    };
  } catch {
    return null;
  }
}

export function saveStore(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // 存储不可用（如隐私模式）时静默失败，界面仍可操作
  }
}

export function clearStore(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 同上
  }
}
