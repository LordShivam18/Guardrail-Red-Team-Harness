"use client";

import { useMemo, useState } from "react";

export type ParetoModelPoint = {
  id: string;
  model: string;
  modelVersion?: string;
  jailbreakRate?: number;
  safetySharpe?: number;
  safetyScore: number;
  utilityScore: number;
  meshScore?: number;
};

type ParetoFrontierProps = {
  points?: ParetoModelPoint[];
};

const WIDTH = 760;
const HEIGHT = 440;
const MARGIN = {
  bottom: 56,
  left: 68,
  right: 28,
  top: 28
};
const X_TICKS = [0, 25, 50, 75, 100];
const Y_TICKS = [0, 25, 50, 75, 100];

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function formatScore(value: number) {
  return `${Math.round(value)}`;
}

function isDominated(point: ParetoModelPoint, points: ParetoModelPoint[]) {
  return points.some(
    (candidate) =>
      candidate.id !== point.id &&
      candidate.safetyScore >= point.safetyScore &&
      candidate.utilityScore >= point.utilityScore &&
      (candidate.safetyScore > point.safetyScore || candidate.utilityScore > point.utilityScore)
  );
}

function getFrontier(points: ParetoModelPoint[]) {
  return points
    .filter((point) => !isDominated(point, points))
    .sort((left, right) => left.utilityScore - right.utilityScore);
}

export function ParetoFrontier({ points = [] }: ParetoFrontierProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const chart = useMemo(() => {
    const innerWidth = WIDTH - MARGIN.left - MARGIN.right;
    const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    const xFor = (score: number) => MARGIN.left + (clampScore(score) / 100) * innerWidth;
    const yFor = (score: number) => MARGIN.top + (1 - clampScore(score) / 100) * innerHeight;
    const plotted = points.map((point) => ({
      ...point,
      dominated: isDominated(point, points),
      x: xFor(point.utilityScore),
      y: yFor(point.safetyScore)
    }));
    const frontierPath = getFrontier(points)
      .map((point) => `${xFor(point.utilityScore)},${yFor(point.safetyScore)}`)
      .join(" ");

    return {
      frontierPath,
      innerHeight,
      innerWidth,
      plotted,
      xFor,
      yFor
    };
  }, [points]);

  const activePoint = chart.plotted.find((point) => point.id === activeId);
  const frontierCount = getFrontier(points).length;

  return (
    <section className="overflow-hidden rounded-md border border-neutral-800 bg-black font-mono text-white">
      <div className="flex flex-col gap-3 border-b border-neutral-800 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
            Safety-Utility Pareto Frontier
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-white">
            Alignment Tax
          </h2>
        </div>
        <div className="flex flex-wrap gap-3 text-xs uppercase text-neutral-500">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 border border-white bg-white" />
            Frontier
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 border border-red-600 bg-red-950" />
            Dominated
          </span>
        </div>
      </div>

      <div className="relative border-b border-neutral-800 bg-black p-3 sm:p-5">
        {points.length === 0 ? (
          <div className="grid min-h-[24rem] place-items-center border border-neutral-800 bg-neutral-950 p-6 text-center text-sm text-neutral-500">
            No Pareto data is available from redteam_runs yet.
          </div>
        ) : (
          <svg
            aria-label="Scatter plot of safety score versus utility score"
            className="block h-auto w-full"
            role="img"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          >
            <rect fill="#000000" height={HEIGHT} width={WIDTH} x="0" y="0" />

            {X_TICKS.map((tick) => {
              const x = chart.xFor(tick);

              return (
                <g key={`x-${tick}`}>
                  <line
                    stroke="#262626"
                    strokeDasharray="2 8"
                    strokeWidth="1"
                    x1={x}
                    x2={x}
                    y1={MARGIN.top}
                    y2={HEIGHT - MARGIN.bottom}
                  />
                  <text
                    fill="#737373"
                    fontSize="11"
                    textAnchor="middle"
                    x={x}
                    y={HEIGHT - 28}
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {Y_TICKS.map((tick) => {
              const y = chart.yFor(tick);

              return (
                <g key={`y-${tick}`}>
                  <line
                    stroke="#262626"
                    strokeDasharray="2 8"
                    strokeWidth="1"
                    x1={MARGIN.left}
                    x2={WIDTH - MARGIN.right}
                    y1={y}
                    y2={y}
                  />
                  <text
                    fill="#737373"
                    fontSize="11"
                    textAnchor="end"
                    x={MARGIN.left - 14}
                    y={y + 4}
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            <line
              stroke="#737373"
              strokeWidth="1.5"
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={HEIGHT - MARGIN.bottom}
              y2={HEIGHT - MARGIN.bottom}
            />
            <line
              stroke="#737373"
              strokeWidth="1.5"
              x1={MARGIN.left}
              x2={MARGIN.left}
              y1={MARGIN.top}
              y2={HEIGHT - MARGIN.bottom}
            />

            <polyline
              fill="none"
              points={chart.frontierPath}
              stroke="#ffffff"
              strokeDasharray="10 9"
              strokeLinecap="square"
              strokeLinejoin="miter"
              strokeWidth="2"
            />

            <text fill="#ffffff" fontSize="12" fontWeight="700" x={WIDTH - 196} y={58}>
              OPTIMAL FRONTIER
            </text>

            {chart.plotted.map((point) => (
              <g key={point.id}>
                <title>
                  {`${point.model} | Mesh ${point.meshScore ?? "N/A"} | Safety ${formatScore(
                    point.safetyScore
                  )} | Utility ${formatScore(point.utilityScore)}`}
                </title>
                <circle
                  className="cursor-crosshair"
                  cx={point.x}
                  cy={point.y}
                  fill={point.dominated ? "#450a0a" : "#ffffff"}
                  onMouseEnter={() => setActiveId(point.id)}
                  onMouseLeave={() => setActiveId(null)}
                  r={activeId === point.id ? 8 : 6}
                  stroke={point.dominated ? "#dc2626" : "#ffffff"}
                  strokeWidth="2"
                />
                <text
                  fill={point.dominated ? "#ef4444" : "#e5e5e5"}
                  fontSize="10"
                  fontWeight="700"
                  textAnchor="middle"
                  x={point.x}
                  y={point.y - 13}
                >
                  {point.model}
                </text>
              </g>
            ))}

            <text
              fill="#a3a3a3"
              fontSize="12"
              fontWeight="700"
              textAnchor="middle"
              x={MARGIN.left + chart.innerWidth / 2}
              y={HEIGHT - 8}
            >
              ← Utility
            </text>
            <text
              fill="#a3a3a3"
              fontSize="12"
              fontWeight="700"
              textAnchor="middle"
              transform={`rotate(-90 ${18} ${MARGIN.top + chart.innerHeight / 2})`}
              x={18}
              y={MARGIN.top + chart.innerHeight / 2}
            >
              Safety →
            </text>
          </svg>
        )}
      </div>

      <div className="grid gap-0 sm:grid-cols-3">
        <div className="border-b border-neutral-800 px-5 py-4 sm:border-b-0 sm:border-r sm:border-neutral-800">
          <p className="text-xs uppercase text-neutral-500">Models</p>
          <p className="mt-1 text-2xl font-black text-white">{points.length}</p>
        </div>
        <div className="border-b border-neutral-800 px-5 py-4 sm:border-b-0 sm:border-r sm:border-neutral-800">
          <p className="text-xs uppercase text-neutral-500">Frontier</p>
          <p className="mt-1 text-2xl font-black text-white">{frontierCount}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs uppercase text-neutral-500">Active</p>
          <p className="mt-1 truncate text-sm font-bold text-white">
            {activePoint
              ? `${activePoint.model} S:${formatScore(activePoint.safetyScore)} U:${formatScore(
                  activePoint.utilityScore
                )}`
              : "NONE"}
          </p>
        </div>
      </div>
    </section>
  );
}
