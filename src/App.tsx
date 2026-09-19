import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import {
  AIR_BONE_GAP_LIMIT,
  DB_MAX,
  DB_MIN,
  EAR_LABEL,
  EAR_SIDES,
  FREQS,
  FREQ_LABEL,
  INTERAURAL_DIFF_LIMIT,
  MASKING_LABEL,
  MASKING_OPTIONS,
  cloneEars,
  emptyEars,
  loadStore,
  makeDraft,
  pta,
  sampleEars,
  saveStore,
  uid,
  validate,
  type DraftState,
  type EarSide,
  type EarsData,
  type Freq,
  type FreqEntry,
  type Masking,
  type Store,
  type Version,
} from "./lib/audiology";
import { Audiogram } from "./components/Audiogram";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

function parseDb(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(DB_MAX, Math.max(DB_MIN, Math.round(n)));
}

function EarTable({
  side,
  ears,
  readOnly,
  issueKeys,
  reviewKeys,
  onChange,
}: {
  side: EarSide;
  ears: EarsData;
  readOnly: boolean;
  issueKeys: Set<string>;
  reviewKeys: Set<string>;
  onChange: (side: EarSide, freq: Freq, patch: Partial<FreqEntry>) => void;
}) {
  const ear = ears[side];
  const earPta = pta(ear);
  return (
    <div className={`ear-block ear-${side}`}>
      <div className="ear-head">
        <h3>{EAR_LABEL[side]}</h3>
        <span className="hint">PTA {earPta === null ? "—" : `${earPta} dB HL`}</span>
      </div>
      <table className="ear-table">
        <thead>
          <tr>
            <th>频率</th>
            <th>气导 dB</th>
            <th>骨导 dB</th>
            <th>掩蔽方式</th>
          </tr>
        </thead>
        <tbody>
          {FREQS.map((f) => {
            const entry = ear[f];
            const key = `${side}:${f}`;
            const rowClass = issueKeys.has(key)
              ? "row-blocked"
              : reviewKeys.has(key)
                ? "row-review"
                : "";
            return (
              <tr key={f} className={rowClass}>
                <th scope="row">{FREQ_LABEL[f]}</th>
                {readOnly ? (
                  <>
                    <td>{entry.ac ?? "—"}</td>
                    <td>{entry.bc ?? "—"}</td>
                    <td>{MASKING_LABEL[entry.masking]}</td>
                  </>
                ) : (
                  <>
                    <td>
                      <input
                        type="number"
                        min={DB_MIN}
                        max={DB_MAX}
                        step={5}
                        value={entry.ac ?? ""}
                        placeholder="—"
                        onChange={(e) =>
                          onChange(side, f, { ac: parseDb(e.target.value) })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={DB_MIN}
                        max={DB_MAX}
                        step={5}
                        value={entry.bc ?? ""}
                        placeholder="—"
                        onChange={(e) =>
                          onChange(side, f, { bc: parseDb(e.target.value) })
                        }
                      />
                    </td>
                    <td>
                      <select
                        value={entry.masking}
                        onChange={(e) =>
                          onChange(side, f, { masking: e.target.value as Masking })
                        }
                      >
                        {MASKING_OPTIONS.map((m) => (
                          <option key={m} value={m}>
                            {MASKING_LABEL[m]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  const [store, setStore] = useState<Store>(
    () => loadStore() ?? { versions: [], draft: makeDraft(sampleEars(), null) }
  );
  const [viewVersionId, setViewVersionId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<EarSide, string>>({
    left: "",
    right: "",
  });

  useEffect(() => {
    saveStore(store);
  }, [store]);

  const draft = store.draft;
  const validation = useMemo(
    () => (draft ? validate(draft.ears, draft.reviews) : null),
    [draft]
  );
  const latest: Version | null = store.versions[store.versions.length - 1] ?? null;

  const issueKeys = useMemo(
    () => new Set((validation?.issues ?? []).map((i) => `${i.ear}:${i.freq}`)),
    [validation]
  );
  const reviewKeys = useMemo(
    () =>
      new Set(
        (validation?.reviewNeeds ?? [])
          .filter((n) => !n.done)
          .map((n) => `${n.ear}:${n.freq}`)
      ),
    [validation]
  );

  const pendingReviews = validation?.reviewNeeds.filter((n) => !n.done) ?? [];
  const reasonOk = !draft?.basedOn || draft.reason.trim().length > 0;
  const adoptable = !!draft && !!validation?.canAdopt && reasonOk;

  const updateEntry = (side: EarSide, freq: Freq, patch: Partial<FreqEntry>) => {
    setStore((s) => {
      if (!s.draft) return s;
      const ears = cloneEars(s.draft.ears);
      ears[side][freq] = { ...ears[side][freq], ...patch };
      return {
        ...s,
        draft: { ...s.draft, ears, updatedAt: new Date().toISOString() },
      };
    });
  };

  const completeReview = (side: EarSide) => {
    const note = reviewNotes[side].trim();
    if (!note || !validation) return;
    setStore((s) => {
      if (!s.draft) return s;
      return {
        ...s,
        draft: {
          ...s.draft,
          reviews: {
            ...s.draft.reviews,
            [side]: { note, at: new Date().toISOString(), signature: validation.signature },
          },
          updatedAt: new Date().toISOString(),
        },
      };
    });
    setReviewNotes((prev) => ({ ...prev, [side]: "" }));
  };

  const adopt = () => {
    if (!draft || !adoptable) return;
    const version: Version = {
      id: uid(),
      n: store.versions.length + 1,
      parentId: draft.basedOn,
      reason: draft.basedOn ? draft.reason.trim() : null,
      adoptedAt: new Date().toISOString(),
      ears: cloneEars(draft.ears),
      reviews: draft.reviews,
    };
    setStore({ versions: [...store.versions, version], draft: null });
    setViewVersionId(null);
  };

  const startReadjust = () => {
    if (!latest) return;
    setStore((s) => ({ ...s, draft: makeDraft(latest.ears, latest.id) }));
    setViewVersionId(null);
  };

  const newDraft = (withSample: boolean) => {
    setStore((s) => ({
      ...s,
      draft: makeDraft(withSample ? sampleEars() : emptyEars(), null),
    }));
    setViewVersionId(null);
  };

  const patchDraft = (patch: Partial<DraftState>) => {
    setStore((s) =>
      s.draft
        ? {
            ...s,
            draft: { ...s.draft, ...patch, updatedAt: new Date().toISOString() },
          }
        : s
    );
  };

  const replaceDraftEars = (ears: EarsData) => {
    // 数据整体替换后旧复核结论不再有效，一并清空
    patchDraft({ ears, reviews: {} });
  };

  const discardDraft = () => {
    setStore((s) => ({ ...s, draft: null }));
  };

  const statusText = draft
    ? validation && validation.issues.length > 0
      ? `草稿 · ${validation.issues.length} 项阻断`
      : pendingReviews.length > 0
        ? "草稿 · 待复核"
        : adoptable
          ? "草稿 · 可采纳"
          : "草稿 · 待完善"
    : latest
      ? `已冻结 · v${latest.n}`
      : "尚未建稿";

  const activeEars = draft ? draft.ears : latest ? latest.ears : null;
  const viewVersion = viewVersionId
    ? (store.versions.find((v) => v.id === viewVersionId) ?? null)
    : null;

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-01 · 听力验配记录</p>
          <h1>听力曲线核验闭环</h1>
          <p className="subtitle">
            每耳录入 0.5 / 1 / 2 / 4 kHz 的气导、骨导与掩蔽方式。骨导高于气导、气骨导差 ≥{" "}
            {AIR_BONE_GAP_LIMIT} dB 未记录掩蔽，或双耳同频气导差 ≥ {INTERAURAL_DIFF_LIMIT}{" "}
            dB 未经复核，均不能采用。采用后曲线冻结，复调只能新建带原因的版本，全部数据本地落盘。
          </p>
        </div>
        <div className="stack-card">
          <span>当前状态</span>
          <strong>{statusText}</strong>
          <span>当前版本</span>
          <strong>{latest ? `v${latest.n}（已冻结）` : "暂无已采用版本"}</strong>
          {latest && <span className="hint">最近采用 {fmtTime(latest.adoptedAt)}</span>}
        </div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <span>阻断项</span>
          <strong>{validation?.issues.length ?? 0}</strong>
          <i className={validation && validation.issues.length > 0 ? "status-danger" : "status-ok"} />
        </article>
        <article className="metric-card">
          <span>待复核</span>
          <strong>{pendingReviews.length}</strong>
          <i className={pendingReviews.length > 0 ? "status-watch" : "status-ok"} />
        </article>
        <article className="metric-card">
          <span>已冻结版本</span>
          <strong>{store.versions.length}</strong>
          <i className="status-ok" />
        </article>
        <article className="metric-card">
          <span>落盘方式</span>
          <strong className="metric-text">localStorage</strong>
          <i className="status-ok" />
        </article>
      </section>

      <section className="workspace">
        <section className="panel">
          <div className="section-heading">
            <div>
              <p>测听数据</p>
              <h2>
                {draft
                  ? draft.basedOn
                    ? `复调草稿（基于 v${store.versions.find((v) => v.id === draft.basedOn)?.n ?? "?"}）`
                    : "测听草稿"
                  : latest
                    ? `当前采用曲线 v${latest.n}`
                    : "尚未建稿"}
                {!draft && latest && <em className="badge badge-frozen">已冻结</em>}
                {draft && <em className="badge badge-draft">未冻结</em>}
              </h2>
            </div>
            <div className="btn-row">
              {draft ? (
                <>
                  <button onClick={() => replaceDraftEars(sampleEars())}>载入示例</button>
                  <button onClick={() => replaceDraftEars(emptyEars())}>清空数据</button>
                  {draft.basedOn && (
                    <button className="danger-ghost" onClick={discardDraft}>
                      放弃复调
                    </button>
                  )}
                </>
              ) : (
                <>
                  {latest && (
                    <button className="primary-action" onClick={startReadjust}>
                      发起复调
                    </button>
                  )}
                  <button onClick={() => newDraft(false)}>新建空白草稿</button>
                  <button onClick={() => newDraft(true)}>载入示例草稿</button>
                </>
              )}
            </div>
          </div>

          {activeEars ? (
            <div className="ears-grid">
              {EAR_SIDES.map((side) => (
                <EarTable
                  key={side}
                  side={side}
                  ears={activeEars}
                  readOnly={!draft}
                  issueKeys={issueKeys}
                  reviewKeys={reviewKeys}
                  onChange={updateEntry}
                />
              ))}
            </div>
          ) : (
            <p className="hint">还没有任何数据，请新建草稿。</p>
          )}
        </section>

        <aside className="panel narrow-panel">
          <div className="section-heading">
            <div>
              <p>核验结果</p>
              <h2>采用门槛</h2>
            </div>
          </div>

          {!draft && (
            <p className="hint">
              {latest
                ? "曲线已冻结，如需调整请发起复调，将生成带原因的新版本。"
                : "建稿后在此查看核验结论。"}
            </p>
          )}

          {draft && validation && (
            <>
              {validation.issues.length === 0 ? (
                <p className="ok-line">✓ 无阻断项：骨导均未高于气导，掩蔽记录完整。</p>
              ) : (
                <ul className="issue-list">
                  {validation.issues.map((issue, idx) => (
                    <li key={idx} className="issue-item danger">
                      <strong>
                        {EAR_LABEL[issue.ear]} · {FREQ_LABEL[issue.freq]}
                      </strong>
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              )}

              {EAR_SIDES.map((side) => {
                const needs = validation.reviewNeeds.filter((n) => n.ear === side);
                if (needs.length === 0) return null;
                const rec = draft.reviews[side];
                const fresh = rec && rec.signature === validation.signature;
                return (
                  <div key={side} className={`review-box ${fresh ? "done" : ""}`}>
                    <h3>
                      {EAR_LABEL[side]}复核
                      {fresh ? (
                        <em className="badge badge-ok">已复核</em>
                      ) : (
                        <em className="badge badge-warn">待复核</em>
                      )}
                    </h3>
                    <ul className="review-need-list">
                      {needs.map((n) => (
                        <li key={n.freq}>
                          {FREQ_LABEL[n.freq]}：双耳气导差 {n.diff} dB ≥{" "}
                          {INTERAURAL_DIFF_LIMIT} dB，较差耳为{EAR_LABEL[n.ear]}
                        </li>
                      ))}
                    </ul>
                    {fresh && rec ? (
                      <p className="hint">
                        复核结论：{rec.note}（{fmtTime(rec.at)}）
                      </p>
                    ) : (
                      <>
                        {rec && (
                          <p className="warn-line">数据已变更，此前复核失效，需重新复核。</p>
                        )}
                        <input
                          value={reviewNotes[side]}
                          placeholder="复核结论（必填），如：加掩蔽复测一致"
                          onChange={(e) =>
                            setReviewNotes((prev) => ({ ...prev, [side]: e.target.value }))
                          }
                        />
                        <button
                          className="primary-action"
                          disabled={!reviewNotes[side].trim()}
                          onClick={() => completeReview(side)}
                        >
                          完成{EAR_LABEL[side]}复核
                        </button>
                      </>
                    )}
                  </div>
                );
              })}

              <div className="adopt-bar">
                {draft.basedOn && (
                  <label className="reason-field">
                    <span>复调原因（必填，将写入版本链）</span>
                    <input
                      value={draft.reason}
                      placeholder="如：用户反馈闷堵，整体增益下调"
                      onChange={(e) => patchDraft({ reason: e.target.value })}
                    />
                  </label>
                )}
                <button
                  className="primary-action adopt-btn"
                  disabled={!adoptable}
                  onClick={adopt}
                >
                  采用并冻结为 v{store.versions.length + 1}
                </button>
                {!adoptable && (
                  <p className="hint">
                    {validation.issues.length > 0
                      ? `还有 ${validation.issues.length} 项阻断未解决`
                      : pendingReviews.length > 0
                        ? "复核完成前不能采用"
                        : !reasonOk
                          ? "复调必须填写原因"
                          : ""}
                  </p>
                )}
              </div>
            </>
          )}
        </aside>
      </section>

      {activeEars && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p>听力曲线</p>
              <h2>
                {draft ? "草稿曲线（未冻结）" : `v${latest?.n} 曲线（已冻结）`}
              </h2>
            </div>
            {!draft && latest && <em className="badge badge-frozen">冻结 · 不可改</em>}
          </div>
          <div className="audiogram-grid">
            {EAR_SIDES.map((side) => (
              <div key={side} className="audiogram-card">
                <h3 className={`ear-title ear-${side}`}>{EAR_LABEL[side]}</h3>
                <Audiogram side={side} data={activeEars[side]} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>版本链</p>
            <h2>采用历史（{store.versions.length}）</h2>
          </div>
        </div>
        {store.versions.length === 0 && !draft && (
          <p className="hint">尚无版本。完成测听草稿并通过核验后，采用即生成 v1。</p>
        )}
        <div className="version-chain">
          {draft && (
            <div className="version-card draft-card">
              <strong>v{store.versions.length + 1} · 草稿</strong>
              <span>
                {draft.basedOn
                  ? `基于 v${store.versions.find((v) => v.id === draft.basedOn)?.n ?? "?"} 的复调`
                  : "首次测听"}
              </span>
              <em className="badge badge-draft">未冻结</em>
            </div>
          )}
          {[...store.versions].reverse().map((v) => {
            const parent = v.parentId
              ? store.versions.find((p) => p.id === v.parentId)
              : null;
            const isCurrent = latest?.id === v.id;
            return (
              <button
                key={v.id}
                className={`version-card ${isCurrent ? "current" : ""}`}
                onClick={() => setViewVersionId(viewVersionId === v.id ? null : v.id)}
              >
                <strong>v{v.n}</strong>
                {isCurrent && <em className="badge badge-frozen">当前采用</em>}
                <span>{fmtTime(v.adoptedAt)}</span>
                <span>{v.reason ? `复调原因：${v.reason}` : "首次采用"}</span>
                {parent && <span className="hint">← 基于 v{parent.n}</span>}
                <span className="hint">
                  复核记录 {Object.keys(v.reviews).length} 条 · 点击查看快照
                </span>
              </button>
            );
          })}
        </div>

        {viewVersion && (
          <div className="snapshot">
            <div className="section-heading">
              <div>
                <p>版本快照</p>
                <h2>
                  v{viewVersion.n} · {viewVersion.reason ?? "首次采用"}
                  <em className="badge badge-frozen">已冻结</em>
                </h2>
              </div>
              <button onClick={() => setViewVersionId(null)}>关闭快照</button>
            </div>
            <div className="audiogram-grid">
              {EAR_SIDES.map((side) => (
                <div key={side} className="audiogram-card">
                  <h3 className={`ear-title ear-${side}`}>{EAR_LABEL[side]}</h3>
                  <Audiogram side={side} data={viewVersion.ears[side]} />
                </div>
              ))}
            </div>
            {Object.entries(viewVersion.reviews).length > 0 && (
              <ul className="snapshot-reviews">
                {EAR_SIDES.filter((s) => viewVersion.reviews[s]).map((s) => (
                  <li key={s}>
                    {EAR_LABEL[s]}复核：{viewVersion.reviews[s]!.note}（
                    {fmtTime(viewVersion.reviews[s]!.at)}）
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
