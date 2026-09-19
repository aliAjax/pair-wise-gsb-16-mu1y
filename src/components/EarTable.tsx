import { EAR_LABEL, FREQUENCIES, FREQ_LABEL, MASKING_OPTIONS } from "../lib/audiology";
import type { EarCurve, EarSide, Frequency, FrequencyEntry, Issue, Masking } from "../lib/audiology";

interface EarTableProps {
  ear: EarSide;
  curve: EarCurve;
  readOnly: boolean;
  issues: Issue[];
  reviewFreqs: Set<Frequency>;
  onChange: (freq: Frequency, patch: Partial<FrequencyEntry>) => void;
}

function parseDb(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function maskingLabel(value: Masking): string {
  return MASKING_OPTIONS.find((option) => option.value === value)?.label ?? "未记录";
}

export default function EarTable({ ear, curve, readOnly, issues, reviewFreqs, onChange }: EarTableProps) {
  return (
    <div className="ear-card">
      <h3>{EAR_LABEL[ear]}</h3>
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
          {FREQUENCIES.map((freq) => {
            const entry = curve[freq];
            const rowIssues = issues.filter((issue) => issue.frequency === freq);
            const hasError = rowIssues.length > 0;
            const needsReview = !hasError && reviewFreqs.has(freq);
            const rowClass = hasError ? "row-error" : needsReview ? "row-review" : "";
            return (
              <tr key={freq} className={rowClass}>
                <td>
                  <span className="freq-label">{FREQ_LABEL[freq]}</span>
                  {hasError && (
                    <em className="badge badge-error" title={rowIssues.map((issue) => issue.detail).join("；")}>
                      违规
                    </em>
                  )}
                  {needsReview && <em className="badge badge-review">待复核</em>}
                </td>
                {readOnly ? (
                  <>
                    <td className="num">{entry.ac ?? "—"}</td>
                    <td className="num">{entry.bc ?? "—"}</td>
                    <td>{maskingLabel(entry.masking)}</td>
                  </>
                ) : (
                  <>
                    <td>
                      <input
                        type="number"
                        step={5}
                        min={-10}
                        max={120}
                        value={entry.ac ?? ""}
                        placeholder="—"
                        aria-label={`${EAR_LABEL[ear]} ${FREQ_LABEL[freq]} 气导`}
                        onChange={(event) => onChange(freq, { ac: parseDb(event.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step={5}
                        min={-10}
                        max={120}
                        value={entry.bc ?? ""}
                        placeholder="—"
                        aria-label={`${EAR_LABEL[ear]} ${FREQ_LABEL[freq]} 骨导`}
                        onChange={(event) => onChange(freq, { bc: parseDb(event.target.value) })}
                      />
                    </td>
                    <td>
                      <select
                        value={entry.masking}
                        aria-label={`${EAR_LABEL[ear]} ${FREQ_LABEL[freq]} 掩蔽方式`}
                        onChange={(event) => onChange(freq, { masking: event.target.value as Masking })}
                      >
                        {MASKING_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
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
