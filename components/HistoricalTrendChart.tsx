"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { HistoricalRunSummary } from "@/lib/db";

type HistoricalTrendChartProps = {
  runs: HistoricalRunSummary[];
};

type TrendPoint = {
  runId: string;
  timestamp: string;
  timestampMs: number;
  jailbreakRate: number;
  fpRate: number;
};

type TooltipPayload = {
  dataKey?: string;
  payload?: TrendPoint;
  value?: number;
};

type TrendTooltipProps = {
  active?: boolean;
  payload?: TooltipPayload[];
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatAxisTime(value: number) {
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

function getRateDomainMax(values: number[]) {
  const highestRate = Math.max(0.1, ...values);

  return Math.min(1, Math.ceil((highestRate + 0.05) * 10) / 10);
}

function TrendTooltip({ active, payload }: TrendTooltipProps) {
  const point = payload?.[0]?.payload;

  if (!active || !point) {
    return null;
  }

  return (
    <div className="min-w-56 rounded-lg border border-white/10 bg-slate-950/95 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl">
      <p className="text-xs font-semibold uppercase text-slate-400">
        {formatTooltipTime(point.timestamp)}
      </p>
      <div className="mt-3 grid gap-2">
        <div className="flex items-center justify-between gap-5 text-sm">
          <span className="text-rose-200">Jailbreak Rate</span>
          <span className="font-semibold text-rose-100">
            {formatPercent(point.jailbreakRate)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-5 text-sm">
          <span className="text-emerald-200">False Positive Rate</span>
          <span className="font-semibold text-emerald-100">
            {formatPercent(point.fpRate)}
          </span>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">Run {point.runId.slice(0, 8)}</p>
    </div>
  );
}

export function HistoricalTrendChart({ runs }: HistoricalTrendChartProps) {
  const chartData = useMemo(
    () =>
      runs.map((run) => ({
        runId: run.runId,
        timestamp: run.timestamp,
        timestampMs: new Date(run.timestamp).getTime(),
        jailbreakRate: run.jailbreakRate,
        fpRate: run.fpRate
      })),
    [runs]
  );

  const domains = useMemo(() => {
    if (chartData.length === 0) {
      return {
        jailbreakMax: 0.1,
        fpMax: 0.1,
        x: [0, ONE_DAY_MS] as [number, number]
      };
    }

    const timestamps = chartData.map((point) => point.timestampMs);
    const minTimestamp = Math.min(...timestamps);
    const maxTimestamp = Math.max(...timestamps);
    const xPadding = minTimestamp === maxTimestamp ? ONE_DAY_MS : 0;

    return {
      jailbreakMax: getRateDomainMax(chartData.map((point) => point.jailbreakRate)),
      fpMax: getRateDomainMax(chartData.map((point) => point.fpRate)),
      x: [minTimestamp - xPadding, maxTimestamp + xPadding] as [number, number]
    };
  }, [chartData]);

  const peaks = useMemo(
    () => ({
      jailbreak: Math.max(0, ...chartData.map((point) => point.jailbreakRate)),
      fp: Math.max(0, ...chartData.map((point) => point.fpRate))
    }),
    [chartData]
  );

  if (runs.length === 0) {
    return (
      <section className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/70 p-6 shadow-xl shadow-black/30 backdrop-blur-xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
              Historical Trends
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-50">Run Timeline</h2>
          </div>
        </div>
        <div className="mt-5 rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400">
          No historical red-team runs have been recorded yet.
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/70 shadow-2xl shadow-black/30 backdrop-blur-xl">
      <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
            Historical Trends
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-50">Run Timeline</h2>
        </div>

        <div className="grid gap-2 text-sm sm:grid-cols-2 lg:text-right">
          <p className="font-semibold text-rose-200">
            Jailbreak peak {formatPercent(peaks.jailbreak)}
          </p>
          <p className="font-semibold text-emerald-200">
            FP peak {formatPercent(peaks.fp)}
          </p>
        </div>
      </div>

      <div className="h-[24rem] border-t border-white/10 bg-[radial-gradient(circle_at_22%_16%,rgba(244,63,94,0.16),transparent_34%),radial-gradient(circle_at_82%_20%,rgba(16,185,129,0.12),transparent_28%),rgba(2,6,23,0.72)] px-2 py-4 sm:px-4">
        <ResponsiveContainer height="100%" width="100%">
          <AreaChart
            data={chartData}
            margin={{
              bottom: 14,
              left: 6,
              right: 12,
              top: 20
            }}
          >
            <defs>
              <linearGradient id="jailbreakGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#fb7185" stopOpacity={0.52} />
                <stop offset="56%" stopColor="#e11d48" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#7f1d1d" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="fpGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.42} />
                <stop offset="62%" stopColor="#10b981" stopOpacity={0.14} />
                <stop offset="100%" stopColor="#064e3b" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148, 163, 184, 0.14)" strokeDasharray="4 8" />
            <XAxis
              dataKey="timestampMs"
              domain={domains.x}
              minTickGap={28}
              stroke="#64748b"
              tickFormatter={formatAxisTime}
              tickLine={false}
              type="number"
            />
            <YAxis
              axisLine={false}
              domain={[0, domains.jailbreakMax]}
              orientation="left"
              stroke="#fb7185"
              tickFormatter={formatPercent}
              tickLine={false}
              width={44}
              yAxisId="jailbreak"
            />
            <YAxis
              axisLine={false}
              domain={[0, domains.fpMax]}
              orientation="right"
              stroke="#34d399"
              tickFormatter={formatPercent}
              tickLine={false}
              width={44}
              yAxisId="fp"
            />
            <Tooltip
              content={<TrendTooltip />}
              cursor={{ stroke: "#e2e8f0", strokeOpacity: 0.28 }}
            />
            <Area
              activeDot={{
                r: 6,
                fill: "#fb7185",
                stroke: "#fff1f2",
                strokeWidth: 2
              }}
              dataKey="jailbreakRate"
              dot={{
                r: 3,
                fill: "#020617",
                stroke: "#fb7185",
                strokeWidth: 2
              }}
              fill="url(#jailbreakGradient)"
              name="Jailbreak Rate"
              stroke="#fb7185"
              strokeWidth={3}
              type="monotone"
              yAxisId="jailbreak"
            />
            <Area
              activeDot={{
                r: 6,
                fill: "#34d399",
                stroke: "#ecfdf5",
                strokeWidth: 2
              }}
              dataKey="fpRate"
              dot={{
                r: 3,
                fill: "#020617",
                stroke: "#34d399",
                strokeWidth: 2
              }}
              fill="url(#fpGradient)"
              name="False Positive Rate"
              stroke="#34d399"
              strokeWidth={3}
              style={{
                filter: "drop-shadow(0 0 12px rgba(52, 211, 153, 0.42))"
              }}
              type="monotone"
              yAxisId="fp"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
