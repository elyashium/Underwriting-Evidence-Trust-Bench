import type { Calibration } from '@/lib/score';

/**
 * A reliability diagram, drawn as plain SVG.
 *
 * Each dot is a confidence bin: how sure the pipeline said it was on the x
 * axis, how often it was actually right on the y. The diagonal is perfect
 * calibration. A dot below the line is over-confidence — the failure mode that
 * matters here, because a reviewer who learns that 0.9 means 0.6 stops
 * believing the number and the confidence score becomes decoration.
 *
 * Dot area carries the bin count, and the table underneath prints the counts
 * outright, because on a sample this small a dot sitting neatly on the line can
 * be one finding that happened to land there.
 */

const SIZE = 340;
const PAD_LEFT = 46;
const PAD_BOTTOM = 40;
const PAD_TOP = 14;
const PAD_RIGHT = 14;

const PLOT_W = SIZE - PAD_LEFT - PAD_RIGHT;
const PLOT_H = SIZE - PAD_TOP - PAD_BOTTOM;

const x = (v: number) => PAD_LEFT + v * PLOT_W;
const y = (v: number) => PAD_TOP + (1 - v) * PLOT_H;

const TICKS = [0, 0.25, 0.5, 0.75, 1];

export function CalibrationChart({
  calibration,
  title,
}: {
  calibration: Calibration;
  title: string;
}) {
  const filled = calibration.bins.filter((b) => b.count > 0);

  return (
    <div>
      <h3>{title}</h3>
      <p className="chart-legend">{calibration.population}</p>

      {calibration.count === 0 ? (
        <div className="card" style={{ marginTop: 10 }}>
          <p className="muted small" style={{ margin: 0 }}>
            Nothing binned yet. {calibration.note}
          </p>
        </div>
      ) : (
        <>
          <svg
            className="chart"
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            width={SIZE}
            height={SIZE}
            role="img"
            aria-label={`Reliability diagram over ${calibration.count} findings`}
          >
            <rect
              x={PAD_LEFT}
              y={PAD_TOP}
              width={PLOT_W}
              height={PLOT_H}
              fill="rgba(255, 253, 246, 0.35)"
              stroke="#8a8171"
              strokeWidth="1.5"
            />

            {TICKS.map((t) => (
              <g key={t}>
                <line
                  x1={x(t)}
                  y1={PAD_TOP}
                  x2={x(t)}
                  y2={PAD_TOP + PLOT_H}
                  stroke="#a39a85"
                  strokeDasharray="1.5 5"
                />
                <line
                  x1={PAD_LEFT}
                  y1={y(t)}
                  x2={PAD_LEFT + PLOT_W}
                  y2={y(t)}
                  stroke="#a39a85"
                  strokeDasharray="1.5 5"
                />
                <text x={x(t)} y={SIZE - PAD_BOTTOM + 15} fontSize="9" fill="#7d7461" textAnchor="middle">
                  {t.toFixed(2)}
                </text>
                <text x={PAD_LEFT - 8} y={y(t) + 3} fontSize="9" fill="#7d7461" textAnchor="end">
                  {t.toFixed(2)}
                </text>
              </g>
            ))}

            {/* Perfect calibration. */}
            <line
              x1={x(0)}
              y1={y(0)}
              x2={x(1)}
              y2={y(1)}
              stroke="#16130d"
              strokeWidth="1.5"
              strokeDasharray="5 5"
            />

            {filled.map((bin) => {
              const cx = x(bin.claimed!);
              const cy = y(bin.observed!);
              const r = 4 + Math.sqrt(bin.count) * 2.2;
              const over = bin.gap! < 0;
              return (
                <g key={bin.lower}>
                  <line x1={cx} y1={cy} x2={cx} y2={y(bin.claimed!)} stroke="#8a8171" strokeDasharray="2 3" />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={over ? 'rgba(161,28,20,0.16)' : 'rgba(30,92,64,0.16)'}
                    stroke={over ? '#a11c14' : '#1e5c40'}
                    strokeWidth="2"
                  />
                  <text
                    x={cx}
                    y={cy - r - 4}
                    fontSize="9"
                    fill="#4d4638"
                    textAnchor="middle"
                  >
                    n={bin.count}
                  </text>
                </g>
              );
            })}

            <text
              x={PAD_LEFT + PLOT_W / 2}
              y={SIZE - 6}
              fontSize="10"
              fill="#4d4638"
              textAnchor="middle"
            >
              confidence the pipeline claimed →
            </text>
            <text
              x={12}
              y={PAD_TOP + PLOT_H / 2}
              fontSize="10"
              fill="#4d4638"
              textAnchor="middle"
              transform={`rotate(-90 12 ${PAD_TOP + PLOT_H / 2})`}
            >
              how often it was right →
            </text>
          </svg>

          <div className="table-scroll">
          <table style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>bin</th>
                <th className="num">n</th>
                <th className="num">right</th>
                <th className="num">observed</th>
                <th className="num">claimed</th>
                <th className="num">gap</th>
              </tr>
            </thead>
            <tbody>
              {calibration.bins.map((bin) => (
                <tr key={bin.lower}>
                  <td className="mono">{bin.label}</td>
                  <td className="num">{bin.count}</td>
                  <td className="num">{bin.count ? bin.correct : '—'}</td>
                  <td className="num">
                    {bin.observed === null ? '—' : bin.observed.toFixed(2)}
                  </td>
                  <td className="num">
                    {bin.claimed === null ? '—' : bin.claimed.toFixed(2)}
                  </td>
                  <td className={`num ${bin.gap !== null && bin.gap < 0 ? 'fail' : ''}`}>
                    {bin.gap === null ? '—' : bin.gap.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <p className="note">
            ECE {calibration.ece === null ? '—' : calibration.ece.toFixed(3)} over{' '}
            {calibration.count} findings. {calibration.note}
          </p>
        </>
      )}
    </div>
  );
}
