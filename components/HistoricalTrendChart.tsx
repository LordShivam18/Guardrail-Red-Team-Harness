"use client";

import { useMemo, useState } from "react";
import type { PointerEvent } from "react";
import type { HistoricalRunSummary } from "@/lib/db";

type HistoricalTrendChartProps = {
  runs: HistoricalRunSummary[];
};

type ChartPoint = {
  x: number;
  jailbreakY: number;
  fpY: number;
  run: HistoricalRunSummary;
};

const WIDTH = 920;
const HEIGHT = 320;
const PADDING = {
  top: 28,
  right: 72,
  bottom: 54,
  left: 72
};

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatTick(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function formatTooltipTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function createLinePath(points: { x: number; y: number }[]) {
  if (points.length === 0) {
    return "";
  }

  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function createAreaPath(points: { x: number; y: number }[], baseline: number) {
  if (points.length === 0) {
    return "";
  }

  const line = createLinePath(points);
  const last = points[points.length - 1];
  const first = points[0];

  return `${line} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
}

export function HistoricalTrendChart({ runs }: HistoricalTrendChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const chart = useMemo(() => {
    const plotWidth = WIDTH - PADDING.left - PADDING.right;
    const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
    const baseline = HEIGHT - PADDING.bottom;
    const highestRate = Math.max(
      0.1,
      ...runs.flatMap((run) => [run.jailbreakRate, run.fpRate])
    );
    const domainMax = Math.min(1, Math.ceil((highestRate + 0.05) * 10) / 10);
    const denominator = Math.max(runs.length - 1, 1);

    const points = runs.map((run, index) => {
      const x =
        runs.length === 1
          ? PADDING.left + plotWidth / 2
          : PADDING.left + (index / denominator) * plotWidth;

      return {
        x,
        jailbreakY: baseline - (run.jailbreakRate / domainMax) * plotHeight,
        fpY: baseline - (run.fpRate / domainMax) * plotHeight,
        run
      };
    });

    const ticks = [0, domainMax / 2, domainMax].map((value) => ({
      value,
      y: baseline - (value / domainMax) * plotHeight
    }));

    return {
      baseline,
      domainMax,
      points,
      ticks,
      plotLeft: PADDING.left,
      plotRight: WIDTH - PADDING.right
    };
  }, [runs]);

  const activePoint =
    activeIndex === null ? chart.points[chart.points.length - 1] : chart.points[activeIndex];

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (chart.points.length === 0) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    const closestIndex = chart.points.reduce((bestIndex, point, index) => {
      const bestPoint = chart.points[bestIndex];

      return Math.abs(point.x - x) < Math.abs(bestPoint.x - x) ? index : bestIndex;
    }, 0);

    setActiveIndex(closestIndex);
  }

  if (runs.length === 0) {
    return (
      <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/70 p-6 shadow-xl shadow-black/20">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
              Historical Trends
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-50">
              Run Timeline
            </h2>
          </div>
        </div>
        <div className="mt-5 rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400">
          No historical red-team runs have been recorded yet.
        </div>
      </section>
    );
  }

  const jailbreakPoints = chart.points.map((point) => ({
    x: point.x,
    y: point.jailbreakY
  }));
  const fpPoints = chart.points.map((point) => ({
    x: point.x,
    y: point.fpY
  }));

  return (
    <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/70 shadow-xl shadow-black/20 backdrop-blur">
      <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            Historical Trends
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-50">Run Timeline</h2>
        </div>

        {activePoint ? (
          <div className="grid gap-2 text-sm sm:grid-cols-3 lg:text-right">
            <p className="text-slate-400">{formatTooltipTime(activePoint.run.timestamp)}</p>
            <p className="font-semibold text-rose-200">
              Jailbreak {formatPercent(activePoint.run.jailbreakRate)}
            </p>
            <p className="font-semibold text-cyan-200">
              FP {formatPercent(activePoint.run.fpRate)}
            </p>
          </div>
        ) : null}
      </div>

      <div className="border-t border-slate-800 bg-slate-950/40 px-2 py-3 sm:px-4">
        <svg
          aria-label="Historical red-team rates"
          className="h-auto w-full"
          onPointerLeave={() => setActiveIndex(null)}
          onPointerMove={handlePointerMove}
          role="img"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        >
          <defs>
            <linearGradient id="jailbreakArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#fb7185" stopOpacity="0.34" />
              <stop offset="100%" stopColor="#fb7185" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="fpArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.02" />
            </linearGradient>
            <filter id="jailbreakGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="4" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect
            fill="rgba(15, 23, 42, 0.38)"
            height={HEIGHT - 18}
            rx="8"
            width={WIDTH - 18}
            x="9"
            y="9"
          />

          {chart.ticks.map((tick) => (
            <g key={tick.value}>
              <line
                stroke="rgba(148, 163, 184, 0.16)"
                strokeDasharray="4 8"
                x1={chart.plotLeft}
                x2={chart.plotRight}
                y1={tick.y}
                y2={tick.y}
              />
              <text
                fill="#fb7185"
                fontSize="12"
                textAnchor="end"
                x={PADDING.left - 18}
                y={tick.y + 4}
              >
                {formatPercent(tick.value)}
              </text>
              <text
                fill="#67e8f9"
                fontSize="12"
                textAnchor="start"
                x={WIDTH - PADDING.right + 18}
                y={tick.y + 4}
              >
                {formatPercent(tick.value)}
              </text>
            </g>
          ))}

          <path
            d={createAreaPath(fpPoints, chart.baseline)}
            fill="url(#fpArea)"
            stroke="none"
          />
          <path
            d={createAreaPath(jailbreakPoints, chart.baseline)}
            fill="url(#jailbreakArea)"
            stroke="none"
          />
          <path
            d={createLinePath(fpPoints)}
            fill="none"
            stroke="#22d3ee"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
          <path
            d={createLinePath(jailbreakPoints)}
            fill="none"
            filter="url(#jailbreakGlow)"
            stroke="#fb7185"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />

          {chart.points.map((point, index) => (
            <g key={point.run.runId}>
              <text
                fill="#94a3b8"
                fontSize="12"
                textAnchor="middle"
                x={point.x}
                y={HEIGHT - 22}
              >
                {formatTick(point.run.timestamp)}
              </text>
              <circle
                cx={point.x}
                cy={point.fpY}
                fill="#020617"
                r={activeIndex === index ? 5 : 3}
                stroke="#22d3ee"
                strokeWidth="2"
              />
              <circle
                cx={point.x}
                cy={point.jailbreakY}
                fill="#020617"
                r={activeIndex === index ? 5 : 3}
                stroke="#fb7185"
                strokeWidth="2"
              />
            </g>
          ))}

          {activePoint ? (
            <g>
              <line
                stroke="rgba(226, 232, 240, 0.38)"
                strokeDasharray="3 5"
                x1={activePoint.x}
                x2={activePoint.x}
                y1={PADDING.top}
                y2={chart.baseline}
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.jailbreakY}
                fill="#fb7185"
                r="4"
              />
              <circle cx={activePoint.x} cy={activePoint.fpY} fill="#22d3ee" r="4" />
            </g>
          ) : null}
        </svg>
      </div>
    </section>
  );
}
