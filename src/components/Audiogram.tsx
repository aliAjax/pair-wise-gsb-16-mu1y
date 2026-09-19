import { FREQUENCIES, FREQ_LABEL } from "../lib/audiology";
import type { CurveData } from "../lib/audiology";

const WIDTH = 620;
const HEIGHT = 340;
const PAD = { left: 46, right: 18, top: 32, bottom: 26 };
const DB_MIN = -10;
const DB_MAX = 120;

const SERIES = [
  { key: "left-ac", ear: "left", field: "ac", color: "#1d4ed8", symbol: "×", dash: "", label: "左耳 气导" },
  { key: "left-bc", ear: "left", field: "bc", color: "#1d4ed8", symbol: ">", dash: "5 4", label: "左耳 骨导" },
  { key: "right-ac", ear: "right", field: "ac", color: "#dc2626", symbol: "○", dash: "", label: "右耳 气导" },
  { key: "right-bc", ear: "right", field: "bc", color: "#dc2626", symbol: "<", dash: "5 4", label: "右耳 骨导" },
] as const;

function buildPaths(
  values: (number | null)[],
  xFor: (index: number) => number,
  yFor: (db: number) => number
): string[] {
  const paths: string[] = [];
  let d = "";
  values.forEach((value, index) => {
    if (value === null) {
      if (d) paths.push(d);
      d = "";
      return;
    }
    d += `${d === "" ? "M" : "L"}${xFor(index).toFixed(1)},${yFor(value).toFixed(1)}`;
  });
  if (d) paths.push(d);
  return paths;
}

export default function Audiogram({ data }: { data: CurveData }) {
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const xFor = (index: number) => PAD.left + (index / (FREQUENCIES.length - 1)) * plotW;
  const yFor = (db: number) => PAD.top + ((db - DB_MIN) / (DB_MAX - DB_MIN)) * plotH;

  const gridLines: number[] = [];
  for (let db = DB_MIN; db <= DB_MAX; db += 10) gridLines.push(db);

  return (
    <div className="audiogram">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="双耳听力图">
        {gridLines.map((db) => (
          <g key={db}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={yFor(db)}
              y2={yFor(db)}
              className={db % 20 === 0 ? "grid-strong" : "grid"}
            />
            <text x={PAD.left - 8} y={yFor(db)} textAnchor="end" dominantBaseline="middle" className="axis-label">
              {db}
            </text>
          </g>
        ))}
        {FREQUENCIES.map((freq, index) => (
          <g key={freq}>
            <line x1={xFor(index)} x2={xFor(index)} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="grid" />
            <text x={xFor(index)} y={PAD.top - 12} textAnchor="middle" className="axis-label freq">
              {FREQ_LABEL[freq]}
            </text>
          </g>
        ))}
        {SERIES.map((series) => {
          const values = FREQUENCIES.map((freq) => data[series.ear][freq][series.field]);
          return (
            <g key={series.key}>
              {buildPaths(values, xFor, yFor).map((d) => (
                <path
                  key={d}
                  d={d}
                  fill="none"
                  stroke={series.color}
                  strokeWidth={1.6}
                  strokeDasharray={series.dash || undefined}
                />
              ))}
              {values.map((value, index) =>
                value === null ? null : (
                  <text
                    key={index}
                    x={xFor(index)}
                    y={yFor(value)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="symbol"
                    fill={series.color}
                  >
                    {series.symbol}
                  </text>
                )
              )}
            </g>
          );
        })}
      </svg>
      <div className="audiogram-legend">
        {SERIES.map((series) => (
          <span key={series.key}>
            <i style={{ color: series.color }}>{series.symbol}</i>
            {series.label}
          </span>
        ))}
        <span className="legend-unit">纵轴：dB HL</span>
      </div>
    </div>
  );
}
