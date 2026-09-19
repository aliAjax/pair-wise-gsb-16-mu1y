import {
  DB_MAX,
  DB_MIN,
  FREQS,
  FREQ_LABEL,
  type EarData,
  type EarSide,
} from "../lib/audiology";

const W = 440;
const H = 300;
const M = { l: 46, r: 16, t: 18, b: 32 };

const xAt = (i: number) => M.l + (i * (W - M.l - M.r)) / (FREQS.length - 1);
const yAt = (db: number) => M.t + ((db - DB_MIN) / (DB_MAX - DB_MIN)) * (H - M.t - M.b);

interface Pt {
  i: number;
  v: number;
}

// 缺测点断开折线，只连接相邻频率
function segments(pts: Pt[]): Pt[][] {
  const segs: Pt[][] = [];
  let cur: Pt[] = [];
  for (const p of pts) {
    if (cur.length > 0 && p.i !== cur[cur.length - 1].i + 1) {
      segs.push(cur);
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length > 0) segs.push(cur);
  return segs;
}

function pointsOf(data: EarData, key: "ac" | "bc"): Pt[] {
  const pts: Pt[] = [];
  FREQS.forEach((f, i) => {
    const v = data[f][key];
    if (v !== null) pts.push({ i, v });
  });
  return pts;
}

export function Audiogram({ side, data }: { side: EarSide; data: EarData }) {
  // 听力图惯例：右耳红、左耳蓝
  const color = side === "right" ? "#dc2626" : "#2563eb";
  const ac = pointsOf(data, "ac");
  const bc = pointsOf(data, "bc");
  const gridDb: number[] = [];
  for (let d = DB_MIN; d <= DB_MAX; d += 10) gridDb.push(d);

  return (
    <svg
      className="audiogram-svg"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${side === "left" ? "左耳" : "右耳"}听力图`}
    >
      {gridDb.map((d) => (
        <g key={d}>
          <line
            x1={M.l}
            x2={W - M.r}
            y1={yAt(d)}
            y2={yAt(d)}
            stroke={d % 20 === 0 ? "#cbd5e1" : "#eef2f7"}
            strokeWidth={1}
          />
          {d % 20 === 0 && (
            <text x={M.l - 8} y={yAt(d) + 3.5} textAnchor="end" className="axis-label">
              {d}
            </text>
          )}
        </g>
      ))}
      {FREQS.map((f, i) => (
        <g key={f}>
          <line
            x1={xAt(i)}
            x2={xAt(i)}
            y1={M.t}
            y2={H - M.b}
            stroke="#eef2f7"
            strokeWidth={1}
          />
          <text x={xAt(i)} y={H - M.b + 18} textAnchor="middle" className="axis-label">
            {FREQ_LABEL[f]}
          </text>
        </g>
      ))}

      {segments(ac).map((seg, k) => (
        <polyline
          key={`ac-${k}`}
          fill="none"
          stroke={color}
          strokeWidth={2}
          points={seg.map((p) => `${xAt(p.i)},${yAt(p.v)}`).join(" ")}
        />
      ))}
      {segments(bc).map((seg, k) => (
        <polyline
          key={`bc-${k}`}
          fill="none"
          stroke={color}
          strokeWidth={1.6}
          strokeDasharray="5 4"
          points={seg.map((p) => `${xAt(p.i)},${yAt(p.v)}`).join(" ")}
        />
      ))}

      {ac.map((p) =>
        side === "right" ? (
          <circle
            key={`acm-${p.i}`}
            cx={xAt(p.i)}
            cy={yAt(p.v)}
            r={4.5}
            fill="none"
            stroke={color}
            strokeWidth={1.8}
          />
        ) : (
          <g key={`acm-${p.i}`} stroke={color} strokeWidth={1.8}>
            <line x1={xAt(p.i) - 4} y1={yAt(p.v) - 4} x2={xAt(p.i) + 4} y2={yAt(p.v) + 4} />
            <line x1={xAt(p.i) - 4} y1={yAt(p.v) + 4} x2={xAt(p.i) + 4} y2={yAt(p.v) - 4} />
          </g>
        )
      )}
      {bc.map((p) => (
        <polyline
          key={`bcm-${p.i}`}
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          points={
            side === "right"
              ? `${xAt(p.i) + 4},${yAt(p.v) - 5} ${xAt(p.i) - 3},${yAt(p.v)} ${xAt(p.i) + 4},${yAt(p.v) + 5}`
              : `${xAt(p.i) - 4},${yAt(p.v) - 5} ${xAt(p.i) + 3},${yAt(p.v)} ${xAt(p.i) - 4},${yAt(p.v) + 5}`
          }
        />
      ))}

      <g className="axis-label">
        <line x1={W - 150} x2={W - 132} y1={14} y2={14} stroke={color} strokeWidth={2} />
        <text x={W - 126} y={17.5}>气导</text>
        <line
          x1={W - 88}
          x2={W - 70}
          y1={14}
          y2={14}
          stroke={color}
          strokeWidth={1.6}
          strokeDasharray="5 4"
        />
        <text x={W - 64} y={17.5}>骨导</text>
      </g>
    </svg>
  );
}
