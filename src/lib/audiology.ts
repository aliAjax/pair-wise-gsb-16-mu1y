export const FREQUENCIES = [500, 1000, 2000, 4000] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export type EarSide = "left" | "right";
export const EAR_SIDES: EarSide[] = ["left", "right"];
export const EAR_LABEL: Record<EarSide, string> = { left: "左耳", right: "右耳" };

export const FREQ_LABEL: Record<Frequency, string> = {
  500: "0.5 kHz",
  1000: "1 kHz",
  2000: "2 kHz",
  4000: "4 kHz",
};

export type Masking = "" | "none" | "air" | "bone";
export const MASKING_OPTIONS: { value: Masking; label: string }[] = [
  { value: "", label: "未记录" },
  { value: "none", label: "无需掩蔽" },
  { value: "air", label: "气导掩蔽" },
  { value: "bone", label: "骨导掩蔽" },
];

export interface FrequencyEntry {
  ac: number | null;
  bc: number | null;
  masking: Masking;
}

export type EarCurve = Record<Frequency, FrequencyEntry>;

export interface CurveData {
  left: EarCurve;
  right: EarCurve;
}

export type IssueRule = "incomplete" | "bc-above-ac" | "abg-needs-masking";

export interface Issue {
  id: string;
  ear: EarSide;
  frequency: Frequency;
  rule: IssueRule;
  detail: string;
}

export interface ReviewItem {
  id: string;
  ear: EarSide;
  frequency: Frequency;
  gap: number;
  worseAc: number;
  betterAc: number;
}

export interface ReviewResolution {
  signature: string;
  resolvedAt: string;
}

export const ABG_MASKING_THRESHOLD = 15;
export const INTER_EAR_GAP_THRESHOLD = 15;

export function emptyCurve(): CurveData {
  const makeEar = (): EarCurve => ({
    500: { ac: null, bc: null, masking: "" },
    1000: { ac: null, bc: null, masking: "" },
    2000: { ac: null, bc: null, masking: "" },
    4000: { ac: null, bc: null, masking: "" },
  });
  return { left: makeEar(), right: makeEar() };
}

export function cloneCurve(data: CurveData): CurveData {
  return JSON.parse(JSON.stringify(data)) as CurveData;
}

/** 演示用草稿：故意包含三类待处理问题，便于核验闭环演示 */
export function seedCurve(): CurveData {
  const curve = emptyCurve();
  curve.left[500] = { ac: 25, bc: 20, masking: "none" };
  curve.left[1000] = { ac: 30, bc: 25, masking: "none" };
  curve.left[2000] = { ac: 35, bc: 30, masking: "none" };
  curve.left[4000] = { ac: 45, bc: 40, masking: "none" };
  // 骨导高于气导
  curve.right[500] = { ac: 45, bc: 50, masking: "" };
  // 气骨导差 ≥15 未记录掩蔽
  curve.right[1000] = { ac: 55, bc: 35, masking: "" };
  // 气骨导差 ≥15 未记录掩蔽 + 双耳气导差 ≥15（右耳较差）
  curve.right[2000] = { ac: 60, bc: 35, masking: "" };
  curve.right[4000] = { ac: 70, bc: 45, masking: "" };
  return curve;
}

/** 规则一/二：骨导高于气导、气骨导差≥15 未记录掩蔽，以及数据完整性 */
export function validateCurve(data: CurveData): Issue[] {
  const issues: Issue[] = [];
  for (const ear of EAR_SIDES) {
    for (const freq of FREQUENCIES) {
      const entry = data[ear][freq];
      const prefix = `${ear}:${freq}`;
      if (entry.ac === null || entry.bc === null) {
        const missing = [entry.ac === null ? "气导" : null, entry.bc === null ? "骨导" : null]
          .filter(Boolean)
          .join("、");
        issues.push({
          id: `${prefix}:incomplete`,
          ear,
          frequency: freq,
          rule: "incomplete",
          detail: `缺少${missing}阈值，数据不完整`,
        });
        continue;
      }
      if (entry.bc > entry.ac) {
        issues.push({
          id: `${prefix}:bc-above-ac`,
          ear,
          frequency: freq,
          rule: "bc-above-ac",
          detail: `骨导 ${entry.bc} dB 高于气导 ${entry.ac} dB`,
        });
      }
      const abg = entry.ac - entry.bc;
      if (abg >= ABG_MASKING_THRESHOLD && entry.masking === "") {
        issues.push({
          id: `${prefix}:abg-needs-masking`,
          ear,
          frequency: freq,
          rule: "abg-needs-masking",
          detail: `气骨导差 ${abg} dB ≥ ${ABG_MASKING_THRESHOLD} dB，未记录掩蔽方式`,
        });
      }
    }
  }
  return issues;
}

/** 规则三：双耳同频气导差 ≥15 dB 时，较差耳（阈值更高的一侧）待复核 */
export function deriveReviewItems(data: CurveData): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const freq of FREQUENCIES) {
    const leftAc = data.left[freq].ac;
    const rightAc = data.right[freq].ac;
    if (leftAc === null || rightAc === null) continue;
    const gap = Math.abs(leftAc - rightAc);
    if (gap < INTER_EAR_GAP_THRESHOLD) continue;
    const worse: EarSide = leftAc > rightAc ? "left" : "right";
    items.push({
      id: `${worse}:${freq}`,
      ear: worse,
      frequency: freq,
      gap,
      worseAc: Math.max(leftAc, rightAc),
      betterAc: Math.min(leftAc, rightAc),
    });
  }
  return items;
}

/** 复核完成时记录当时数值签名；数值一旦被改动，复核自动失效回到待复核 */
export function reviewSignature(item: ReviewItem): string {
  return `${item.worseAc}|${item.betterAc}`;
}

export function isResolved(item: ReviewItem, resolved: Record<string, ReviewResolution>): boolean {
  const resolution = resolved[item.id];
  return Boolean(resolution && resolution.signature === reviewSignature(item));
}

/** 纯音平均听阈：0.5/1/2/4 kHz 气导均值，缺值返回 null */
export function pta(curve: EarCurve): number | null {
  let sum = 0;
  for (const freq of FREQUENCIES) {
    const ac = curve[freq].ac;
    if (ac === null) return null;
    sum += ac;
  }
  return sum / FREQUENCIES.length;
}
