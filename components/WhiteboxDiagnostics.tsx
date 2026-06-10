"use client";

import { useMemo } from "react";

type VariancePoint = {
  token: number;
  variance: number;
};

type TokenSegment = {
  highlighted: boolean;
  text: string;
};

type TokenEvent = {
  id: string;
  timestamp: string;
  category: string;
  outcomeFlag: "PASSED" | "FAILED" | "FP" | "FN";
  blocked: boolean;
  tokens: TokenSegment[];
};

type WhiteboxDiagnosticsProps = {
  events?: TokenEvent[];
  runLabel?: string;
  varianceSeries?: VariancePoint[];
};

const CHART_WIDTH = 760;
const CHART_HEIGHT = 220;
const CHART_MARGIN = {
  bottom: 32,
  left: 48,
  right: 20,
  top: 18
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function toPath(points: Array<VariancePoint & { x: number; y: number }>) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function formatEventTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

export function WhiteboxDiagnostics({
  events = [],
  runLabel = "latest run",
  varianceSeries = []
}: WhiteboxDiagnosticsProps) {
  const chart = useMemo(() => {
    const innerWidth = CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right;
    const innerHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom;
    const maxToken = Math.max(1, ...varianceSeries.map((point) => point.token));
    const plotted = varianceSeries.map((point) => ({
      ...point,
      x: CHART_MARGIN.left + (point.token / maxToken) * innerWidth,
      y: CHART_MARGIN.top + (1 - clamp01(point.variance)) * innerHeight
    }));

    return {
      innerHeight,
      innerWidth,
      path: toPath(plotted),
      plotted
    };
  }, [varianceSeries]);

  const peakVariance = Math.max(0, ...varianceSeries.map((point) => point.variance));
  const highlightedTokenCount = events.reduce(
    (total, event) => total + event.tokens.filter((token) => token.highlighted).length,
    0
  );

  return (
    <section className="overflow-hidden rounded-md border border-neutral-800 bg-black font-mono text-white">
      <div className="flex flex-col gap-2 border-b border-neutral-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
            White-Box Diagnostics
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-white">
            Failure Trace
          </h2>
        </div>
        <div className="text-xs uppercase text-neutral-500">
          Peak Variance:{" "}
          <span className="font-black text-red-500">{peakVariance.toFixed(2)}</span>
        </div>
      </div>

      <div className="grid min-h-[560px] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <div className="border-b border-neutral-800 bg-black lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-500">
              Token Event Log
            </p>
            <p className="text-xs uppercase text-red-500">{runLabel}</p>
          </div>

          <div className="max-h-[34rem] min-h-[28rem] overflow-y-auto bg-neutral-950 p-4">
            {events.length === 0 ? (
              <div className="grid min-h-80 place-items-center border border-neutral-800 bg-black p-6 text-center text-sm text-neutral-500">
                No token events are available for the latest run.
              </div>
            ) : (
              <div className="space-y-3">
                {events.map((event, index) => (
                  <div className="border border-neutral-800 bg-black" key={event.id}>
                    <div className="flex flex-wrap items-center gap-3 border-b border-neutral-800 px-3 py-2 text-[11px] uppercase text-neutral-500">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <span>{formatEventTime(event.timestamp)}</span>
                      <span>{event.category}</span>
                      <span className={event.blocked ? "text-red-500" : "text-white"}>
                        {event.outcomeFlag}
                      </span>
                    </div>
                    <pre className="whitespace-pre-wrap break-words px-3 py-3 text-xs leading-6 text-neutral-300">
                      {event.tokens.map((token, tokenIndex) => (
                        <span
                          className={
                            token.highlighted
                              ? "border border-red-900/70 bg-red-950/50 px-0.5 py-px font-black text-red-300"
                              : undefined
                          }
                          key={`${event.id}-${tokenIndex}`}
                        >
                          {token.text}
                        </span>
                      ))}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-black">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-500">
              Logit Variance Sparkline
            </p>
            <p className="text-xs uppercase text-red-500">redteam_runs.safety_variance</p>
          </div>

          <div className="p-3 sm:p-5">
            <svg
              aria-label="Simulated logit variance time-series"
              className="block h-auto w-full"
              role="img"
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            >
              <rect fill="#000000" height={CHART_HEIGHT} width={CHART_WIDTH} x="0" y="0" />

              {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
                const y = CHART_MARGIN.top + (1 - tick) * chart.innerHeight;

                return (
                  <g key={tick}>
                    <line
                      stroke="#262626"
                      strokeDasharray="2 8"
                      strokeWidth="1"
                      x1={CHART_MARGIN.left}
                      x2={CHART_WIDTH - CHART_MARGIN.right}
                      y1={y}
                      y2={y}
                    />
                    <text fill="#737373" fontSize="10" textAnchor="end" x={34} y={y + 4}>
                      {tick.toFixed(2)}
                    </text>
                  </g>
                );
              })}

              <line
                stroke="#737373"
                strokeWidth="1.5"
                x1={CHART_MARGIN.left}
                x2={CHART_WIDTH - CHART_MARGIN.right}
                y1={CHART_HEIGHT - CHART_MARGIN.bottom}
                y2={CHART_HEIGHT - CHART_MARGIN.bottom}
              />
              <line
                stroke="#737373"
                strokeWidth="1.5"
                x1={CHART_MARGIN.left}
                x2={CHART_MARGIN.left}
                y1={CHART_MARGIN.top}
                y2={CHART_HEIGHT - CHART_MARGIN.bottom}
              />

              <path d={chart.path} fill="none" stroke="#ef4444" strokeWidth="2" />

              {chart.plotted.map((point) => (
                <circle
                  cx={point.x}
                  cy={point.y}
                  fill={point.variance >= 0.6 ? "#ef4444" : "#000000"}
                  key={point.token}
                  r={point.variance >= 0.6 ? 5 : 3}
                  stroke={point.variance >= 0.6 ? "#ef4444" : "#ffffff"}
                  strokeWidth="2"
                />
              ))}

              <text
                fill="#a3a3a3"
                fontSize="11"
                fontWeight="700"
                textAnchor="middle"
                x={CHART_MARGIN.left + chart.innerWidth / 2}
                y={CHART_HEIGHT - 7}
              >
                TOKEN POSITION
              </text>
            </svg>
          </div>

          <div className="px-4 pb-4 sm:px-5 sm:pb-5">
            <div className="grid gap-0 border border-neutral-800 sm:grid-cols-3">
              <div className="border-b border-neutral-800 px-4 py-3 sm:border-b-0 sm:border-r sm:border-neutral-800">
                <p className="text-xs uppercase text-neutral-500">Highlighted Tokens</p>
                <p className="mt-1 text-lg font-black text-red-500">
                  {highlightedTokenCount}
                </p>
              </div>
              <div className="border-b border-neutral-800 px-4 py-3 sm:border-b-0 sm:border-r sm:border-neutral-800">
                <p className="text-xs uppercase text-neutral-500">Events</p>
                <p className="mt-1 text-lg font-black text-white">{events.length}</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-xs uppercase text-neutral-500">Peak</p>
                <p className="mt-1 text-lg font-black text-white">{peakVariance.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
