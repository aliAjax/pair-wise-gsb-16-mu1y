import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import {
  EAR_LABEL,
  FREQ_LABEL,
  cloneCurve,
  deriveReviewItems,
  emptyCurve,
  isResolved,
  pta,
  reviewSignature,
  seedCurve,
  validateCurve,
} from "./lib/audiology";
import type { EarSide, Frequency, FrequencyEntry, ReviewItem } from "./lib/audiology";
import { clearStore, loadStore, saveStore } from "./lib/storage";
import type { Store, Version } from "./lib/storage";
import Audiogram from "./components/Audiogram";
import EarTable from "./components/EarTable";

function createInitialStore(): Store {
  return { versions: [], draft: seedCurve(), draftResolved: {} };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

function ptaText(curve: ReturnType<typeof emptyCurve>["left"]): string {
  const value = pta(curve);
  return value === null ? "—" : `${value.toFixed(1)} dB`;
}

function reviewText(item: ReviewItem): string {
  const other: EarSide = item.ear === "left" ? "right" : "left";
  return `双耳气导差 ${item.gap} dB（${EAR_LABEL[item.ear]} ${item.worseAc} dB / ${EAR_LABEL[other]} ${item.betterAc} dB），${EAR_LABEL[item.ear]}较差`;
}

interface Metric {
  label: string;
  value: string;
  note: string;
  tone: "ok" | "watch" | "danger";
}

function MetricCard({ metric }: { metric: Metric }) {
  return (
    <article className="metric-card">
      <span>{metric.label}</span>
      <strong>{metric.value}</strong>
      <small>{metric.note}</small>
      <i className={`status-${metric.tone}`} />
    </article>
  );
}

export default function App() {
  const [store, setStore] = useState<Store>(() => loadStore() ?? createInitialStore());
  const [reason, setReason] = useState("");

  // 每次状态变化即落盘，刷新后曲线、复核状态与版本链保持一致
  useEffect(() => {
    saveStore(store);
  }, [store]);

  const latest = store.versions[store.versions.length - 1] ?? null;
  const editing = store.draft !== null;
  const displayData = store.draft ?? latest?.data ?? emptyCurve();

  const issues = useMemo(() => (store.draft ? validateCurve(store.draft) : []), [store.draft]);
  const reviewItems = useMemo(() => (store.draft ? deriveReviewItems(store.draft) : []), [store.draft]);
  const pending = reviewItems.filter((item) => !isResolved(item, store.draftResolved));
  const resolvedItems = reviewItems.filter((item) => isResolved(item, store.draftResolved));

  const needReason = store.versions.length > 0;
  const reasonMissing = needReason && reason.trim() === "";
  const canAdopt = editing && issues.length === 0 && pending.length === 0 && !reasonMissing;

  const blockers: string[] = [];
  if (issues.length > 0) blockers.push(`${issues.length} 项违规`);
  if (pending.length > 0) blockers.push(`${pending.length} 项待复核`);
  if (reasonMissing) blockers.push("需填写复调原因");

  const pendingFreqsByEar: Record<EarSide, Set<Frequency>> = {
    left: new Set(pending.filter((item) => item.ear === "left").map((item) => item.frequency)),
    right: new Set(pending.filter((item) => item.ear === "right").map((item) => item.frequency)),
  };

  const metrics: Metric[] = [
    {
      label: "当前版本",
      value: latest ? `v${latest.versionNo}` : "—",
      note: latest ? latest.reason : "尚未采用任何版本",
      tone: latest ? "ok" : "watch",
    },
    {
      label: "曲线状态",
      value: editing ? "编辑中" : "已冻结",
      note: editing ? (needReason ? `基于 v${latest?.versionNo} 的复调草稿` : "初测草稿") : "采用后只读，复调需新建版本",
      tone: editing ? "watch" : "ok",
    },
    {
      label: "待复核",
      value: String(pending.length),
      note: pending.length > 0 ? "复核完成前不能采用" : "无待复核项",
      tone: pending.length > 0 ? "watch" : "ok",
    },
    {
      label: "核验违规",
      value: String(issues.length),
      note: issues.length > 0 ? "存在违规时不能采用" : "核验规则全部通过",
      tone: issues.length > 0 ? "danger" : "ok",
    },
  ];

  function updateEntry(ear: EarSide, freq: Frequency, patch: Partial<FrequencyEntry>) {
    setStore((prev) => {
      if (!prev.draft) return prev;
      const draft = cloneCurve(prev.draft);
      draft[ear][freq] = { ...draft[ear][freq], ...patch };
      return { ...prev, draft };
    });
  }

  function resolveReview(item: ReviewItem) {
    setStore((prev) => ({
      ...prev,
      draftResolved: {
        ...prev.draftResolved,
        [item.id]: { signature: reviewSignature(item), resolvedAt: new Date().toISOString() },
      },
    }));
  }

  function adopt() {
    if (!canAdopt || !store.draft) return;
    const version: Version = {
      id: `v${store.versions.length + 1}-${Date.now()}`,
      versionNo: store.versions.length + 1,
      createdAt: new Date().toISOString(),
      reason: needReason ? reason.trim() : reason.trim() || "初测采用",
      data: cloneCurve(store.draft),
      resolvedReviews: store.draftResolved,
    };
    setStore((prev) => ({ versions: [...prev.versions, version], draft: null, draftResolved: {} }));
    setReason("");
  }

  function startRetune() {
    if (!latest) return;
    setStore((prev) => ({ ...prev, draft: cloneCurve(latest.data), draftResolved: {} }));
    setReason("");
  }

  function discardDraft() {
    setStore((prev) => ({ ...prev, draft: null, draftResolved: {} }));
    setReason("");
  }

  function newDraft() {
    setStore((prev) => ({ ...prev, draft: emptyCurve(), draftResolved: {} }));
    setReason("");
  }

  function resetAll() {
    if (!window.confirm("确定清空全部版本与草稿，恢复示例数据？")) return;
    clearStore();
    setStore(createInitialStore());
    setReason("");
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-01 · 听力曲线核验闭环</p>
          <h1>听力验配记录</h1>
          <p className="subtitle">
            每耳录入 0.5 / 1 / 2 / 4 kHz 气导、骨导与掩蔽方式；核验通过且复核完成后方可采用，采用即冻结，
            复调只能新建带原因的版本。数据落盘于浏览器本地存储，刷新后曲线、复核状态与版本链保持一致。
          </p>
        </div>
        <div className="stack-card">
          <span>当前状态</span>
          <strong>
            {editing
              ? needReason
                ? `复调草稿 · 基于 v${latest?.versionNo}`
                : "初测草稿 · 待采用"
              : latest
                ? `已冻结 · v${latest.versionNo}`
                : "空档案"}
          </strong>
          <span>已采用版本 {store.versions.length} 个 · 本地持久化</span>
        </div>
      </section>

      <section className="metrics-grid">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <h2>操作</h2>
          {editing ? (
            <div className="action-stack">
              <label>
                <span>{needReason ? "复调原因（必填）" : "采用备注（可选）"}</span>
                <input
                  value={reason}
                  placeholder={needReason ? "例如：用户反馈左耳闷胀，复测后调整" : "默认为“初测采用”"}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <button className="primary-action" disabled={!canAdopt} onClick={adopt}>
                采用并冻结曲线
              </button>
              {blockers.length > 0 && <p className="blocker">暂不能采用：{blockers.join(" · ")}</p>}
              {needReason && <button onClick={discardDraft}>放弃本次复调</button>}
            </div>
          ) : latest ? (
            <div className="action-stack">
              <p className="hint">曲线已冻结（v{latest.versionNo}），内容只读。</p>
              <button className="primary-action" onClick={startRetune}>
                复调 · 新建版本
              </button>
            </div>
          ) : (
            <div className="action-stack">
              <button className="primary-action" onClick={newDraft}>
                新建草稿
              </button>
            </div>
          )}

          <h2>核验规则</h2>
          <ol className="rule-list">
            <li>骨导高于气导 → 不能采用</li>
            <li>气骨导差 ≥ 15 dB 且未记录掩蔽方式 → 不能采用</li>
            <li>双耳同频气导差 ≥ 15 dB → 较差耳待复核，复核完成前不能采用</li>
          </ol>

          <button className="danger-action" onClick={resetAll}>
            重置为示例数据
          </button>
          <p className="hint">数据保存在浏览器 localStorage，刷新后自动恢复。</p>
        </aside>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>听力曲线</p>
              <h2>
                双耳听力图
                {editing ? "（草稿）" : latest ? `（v${latest.versionNo} 已冻结）` : ""}
              </h2>
            </div>
          </div>
          <Audiogram data={displayData} />
          <div className="ear-grid">
            <EarTable
              ear="left"
              curve={displayData.left}
              readOnly={!editing}
              issues={issues.filter((issue) => issue.ear === "left")}
              reviewFreqs={pendingFreqsByEar.left}
              onChange={(freq, patch) => updateEntry("left", freq, patch)}
            />
            <EarTable
              ear="right"
              curve={displayData.right}
              readOnly={!editing}
              issues={issues.filter((issue) => issue.ear === "right")}
              reviewFreqs={pendingFreqsByEar.right}
              onChange={(freq, patch) => updateEntry("right", freq, patch)}
            />
          </div>
        </section>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>核验结果</p>
            <h2>采用前检查</h2>
          </div>
        </div>
        {!editing ? (
          <p className="hint">
            当前无编辑中的草稿。
            {latest ? `v${latest.versionNo} 已冻结，复调将基于它生成新版本。` : "请新建草稿开始录入。"}
          </p>
        ) : (
          <>
            {issues.length === 0 && pending.length === 0 ? (
              <p className="ok-banner">✓ 核验通过，无待复核项，可采用并冻结曲线。</p>
            ) : (
              <div className="check-grid">
                <div>
                  <h3>违规（{issues.length}）</h3>
                  {issues.length === 0 ? (
                    <p className="hint">无</p>
                  ) : (
                    <ul className="issue-list">
                      {issues.map((issue) => (
                        <li key={issue.id}>
                          <strong>
                            【{EAR_LABEL[issue.ear]} · {FREQ_LABEL[issue.frequency]}】
                          </strong>
                          {issue.detail}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3>待复核（{pending.length}）</h3>
                  {pending.length === 0 ? (
                    <p className="hint">无</p>
                  ) : (
                    <ul className="review-list">
                      {pending.map((item) => (
                        <li key={item.id}>
                          <div>
                            <strong>
                              【{EAR_LABEL[item.ear]} · {FREQ_LABEL[item.frequency]}】
                            </strong>
                            {reviewText(item)}
                          </div>
                          <button onClick={() => resolveReview(item)}>复核完成</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
            {resolvedItems.length > 0 && (
              <div className="resolved-list">
                <h3>已复核（{resolvedItems.length}）</h3>
                <ul>
                  {resolvedItems.map((item) => (
                    <li key={item.id}>
                      <strong>
                        【{EAR_LABEL[item.ear]} · {FREQ_LABEL[item.frequency]}】
                      </strong>
                      {reviewText(item)}
                      <span className="resolved-at">✓ {formatTime(store.draftResolved[item.id].resolvedAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>版本链</p>
            <h2>采用历史</h2>
          </div>
        </div>
        {store.versions.length === 0 ? (
          <p className="hint">尚无已采用版本。首个版本采用后，此处将形成不可篡改的版本链。</p>
        ) : (
          <ol className="version-chain">
            {store.versions.map((version, index) => (
              <li key={version.id} className={index === store.versions.length - 1 ? "current" : ""}>
                <div className="version-badge">v{version.versionNo}</div>
                <div>
                  <h3>
                    {version.reason}
                    {index === store.versions.length - 1 && <span className="tag">当前采用</span>}
                  </h3>
                  <p>
                    {formatTime(version.createdAt)} · 左耳 PTA {ptaText(version.data.left)} · 右耳 PTA{" "}
                    {ptaText(version.data.right)} · 复核 {Object.keys(version.resolvedReviews).length} 项
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
