// 听力曲线核验闭环：领域模型、核验规则、版本链与本地落盘

export type EarSide = "left" | "right";
export const EAR_SIDES: EarSide[] = ["left", "right"];
export const EAR_LABEL: Record<EarSide, string> = { left: "左耳", right: "右耳" };

export const FREQS = [500, 1000, 2000, 4000] as const;
export type Freq = (typeof FREQS)[number];
export const FREQ_LABEL: Record<Freq, string> = {
  500: "0.5kHz",
  1000: "1kHz",
  2000: "2kHz",
  4000: "4kHz",
};

export type Masking = "none" | "ac" | "bc" | "acbc";
export const MASKING_OPTIONS: Masking[] = ["none", "ac", "bc", "acbc"];
export const MASKING_LABEL: Record<Masking, string> = {
  none: "未记录",
  ac: "气导掩蔽",
  bc: "骨导掩蔽",
  acbc: "气导+骨导掩蔽",
};

export const AIR_BONE_GAP_LIMIT = 15; // 气骨导差达到 15 dB 必须记录掩蔽方式
export const INTERAURAL_DIFF_LIMIT = 15; // 双耳同频气导差达到 15 dB 较差耳待复核
export const DB_MIN = -10;
export const DB_MAX = 120;

export interface FreqEntry {
  ac: number | null; // 气导 dB HL
  bc: number | null; // 骨导 dB HL
  masking: Masking;
}

export type EarData = { [f in Freq]: FreqEntry };
export interface EarsData {
  left: EarData;
  right: EarData;
}

export interface ReviewRecord {
  note: string;
  at: string; // ISO 时间
  signature: string; // 复核时的双耳气导签名，数据变更后自动失效
}

export interface DraftState {
  ears: EarsData;
  reviews: Partial<Record<EarSide, ReviewRecord>>;
  reason: string; // 复调原因（basedOn 非空时必填）
  basedOn: string | null; // 基于哪个冻结版本发起的复调
  updatedAt: string;
}

export interface Version {
  id: string;
  n: number;
  parentId: string | null;
  reason: string | null; // null 表示首次采用
  adoptedAt: string;
  ears: EarsData;
  reviews: Partial<Record<EarSide, ReviewRecord>>;
}

export interface Store {
  versions: Version[];
  draft: DraftState | null;
}

export type IssueKind = "missing" | "bc-over-ac" | "masking-missing";
export interface Issue {
  ear: EarSide;
  freq: Freq;
  kind: IssueKind;
  message: string;
}

export interface ReviewNeed {
  ear: EarSide; // 较差耳
  freq: Freq;
  diff: number;
  done: boolean;
  stale: boolean; // 曾复核但数据已变更
}

export interface Validation {
  issues: Issue[];
  reviewNeeds: ReviewNeed[];
  canAdopt: boolean;
  signature: string;
}

export function emptyEarData(): EarData {
  return {
    500: { ac: null, bc: null, masking: "none" },
    1000: { ac: null, bc: null, masking: "none" },
    2000: { ac: null, bc: null, masking: "none" },
    4000: { ac: null, bc: null, masking: "none" },
  };
}

export function emptyEars(): EarsData {
  return { left: emptyEarData(), right: emptyEarData() };
}

// 示例：右耳传导性成分（气骨导差 ≥15 且未掩蔽）+ 双耳差 ≥15 触发复核
export function sampleEars(): EarsData {
  const ears = emptyEars();
  const left: [number, number][] = [
    [25, 20],
    [30, 25],
    [45, 40],
    [60, 55],
  ];
  const right: [number, number][] = [
    [45, 20],
    [55, 25],
    [65, 30],
    [75, 40],
  ];
  FREQS.forEach((f, i) => {
    ears.left[f] = { ac: left[i][0], bc: left[i][1], masking: "none" };
    ears.right[f] = { ac: right[i][0], bc: right[i][1], masking: "none" };
  });
  return ears;
}

export function cloneEars(ears: EarsData): EarsData {
  return JSON.parse(JSON.stringify(ears)) as EarsData;
}

export function makeDraft(ears: EarsData, basedOn: string | null): DraftState {
  return {
    ears: cloneEars(ears),
    reviews: {},
    reason: "",
    basedOn,
    updatedAt: new Date().toISOString(),
  };
}

// 语频平均听阈（0.5/1/2/4kHz 气导均值），数据不全时返回 null
export function pta(ear: EarData): number | null {
  const vals = FREQS.map((f) => ear[f].ac);
  if (vals.some((v) => v === null)) return null;
  return Math.round((vals as number[]).reduce((a, b) => a + b, 0) / vals.length);
}

// 复核签名：双耳同频气导差由两耳气导共同决定，任一变化都应让旧复核失效
export function reviewSignature(ears: EarsData): string {
  return FREQS.map((f) => `${ears.left[f].ac ?? "?"}/${ears.right[f].ac ?? "?"}`).join("|");
}

export function validate(
  ears: EarsData,
  reviews: Partial<Record<EarSide, ReviewRecord>>
): Validation {
  const issues: Issue[] = [];

  for (const side of EAR_SIDES) {
    for (const f of FREQS) {
      const e = ears[side][f];
      if (e.ac === null || e.bc === null) {
        issues.push({
          ear: side,
          freq: f,
          kind: "missing",
          message: "气导/骨导阈值未录全",
        });
        continue;
      }
      if (e.bc > e.ac) {
        issues.push({
          ear: side,
          freq: f,
          kind: "bc-over-ac",
          message: `骨导 ${e.bc} dB 高于气导 ${e.ac} dB`,
        });
      }
      const gap = e.ac - e.bc;
      if (gap >= AIR_BONE_GAP_LIMIT && e.masking === "none") {
        issues.push({
          ear: side,
          freq: f,
          kind: "masking-missing",
          message: `气骨导差 ${gap} dB ≥ ${AIR_BONE_GAP_LIMIT} dB，未记录掩蔽方式`,
        });
      }
    }
  }

  const signature = reviewSignature(ears);
  const reviewNeeds: ReviewNeed[] = [];
  for (const f of FREQS) {
    const l = ears.left[f].ac;
    const r = ears.right[f].ac;
    if (l === null || r === null) continue;
    const diff = Math.abs(l - r);
    if (diff >= INTERAURAL_DIFF_LIMIT) {
      const worse: EarSide = l > r ? "left" : "right";
      const rec = reviews[worse];
      const done = !!rec && rec.signature === signature;
      reviewNeeds.push({
        ear: worse,
        freq: f,
        diff,
        done,
        stale: !!rec && rec.signature !== signature,
      });
    }
  }

  return {
    issues,
    reviewNeeds,
    canAdopt: issues.length === 0 && reviewNeeds.every((n) => n.done),
    signature,
  };
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const STORAGE_KEY = "hxwl01.audiogram.store.v1";

export function loadStore(): Store | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Store;
    if (!parsed || !Array.isArray(parsed.versions)) return null;
    return { versions: parsed.versions, draft: parsed.draft ?? null };
  } catch {
    return null;
  }
}

export function saveStore(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // 存储不可用（隐私模式等）时静默降级为内存态
  }
}
