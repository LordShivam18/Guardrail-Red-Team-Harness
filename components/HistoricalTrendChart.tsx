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
    <div className="min-w-56 rounded-md border border-neutral-700 bg-neutral-950 p-4">
      <p className="font-mono text-xs font-medium uppercase text-neutral-500">
        {formatTooltipTime(point.timestamp)}
      </p>
      <div className="mt-3 grid gap-2">
        <div className="flex items-center justify-between gap-5 text-sm">
          <span className="text-neutral-400">Jailbreak Rate</span>
          <span className="font-black text-red-500">
            {formatPercent(point.jailbreakRate)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-5 text-sm">
          <span className="text-neutral-400">False Positive Rate</span>
          <span className="font-black text-white">
            {formatPercent(point.fpRate)}
          </span>
        </div>
      </div>
      <p className="mt-3 font-mono text-xs text-neutral-600">Run {point.runId.slice(0, 8)}</p>
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
      <section className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-950 p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
              Historical Trends
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Run Timeline</h2>
          </div>
        </div>
        <div className="mt-5 rounded-md border border-neutral-800 bg-black p-6 text-sm text-neutral-500">
          No historical red-team runs have been recorded yet.
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-950">
      <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
            Historical Trends
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Run Timeline</h2>
        </div>

        <div className="grid gap-2 text-sm sm:grid-cols-2 lg:text-right">
          <p className="font-mono font-bold text-red-500">
            Jailbreak peak {formatPercent(peaks.jailbreak)}
          </p>
          <p className="font-mono font-bold text-white">
            FP peak {formatPercent(peaks.fp)}
          </p>
        </div>
      </div>

      <div className="w-full h-[400px] min-h-[400px] border-t border-neutral-800 bg-black px-2 py-4 sm:px-4">
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
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                <stop offset="56%" stopColor="#ef4444" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id="fpGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" stopOpacity={0.3} />
                <stop offset="62%" stopColor="#ffffff" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#ffffff" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(64, 64, 64, 0.5)" strokeDasharray="4 8" />
            <XAxis
              dataKey="timestampMs"
              domain={domains.x}
              minTickGap={28}
              stroke="#525252"
              tickFormatter={formatAxisTime}
              tickLine={false}
              type="number"
            />
            <YAxis
              axisLine={false}
              domain={[0, domains.jailbreakMax]}
              orientation="left"
              stroke="#ef4444"
              tickFormatter={formatPercent}
              tickLine={false}
              width={44}
              yAxisId="jailbreak"
            />
            <YAxis
              axisLine={false}
              domain={[0, domains.fpMax]}
              orientation="right"
              stroke="#a3a3a3"
              tickFormatter={formatPercent}
              tickLine={false}
              width={44}
              yAxisId="fp"
            />
            <Tooltip
              content={<TrendTooltip />}
              cursor={{ stroke: "#525252", strokeOpacity: 0.5 }}
            />
            <Area
              activeDot={{
                r: 6,
                fill: "#ef4444",
                stroke: "#000000",
                strokeWidth: 2
              }}
              dataKey="jailbreakRate"
              dot={{
                r: 3,
                fill: "#000000",
                stroke: "#ef4444",
                strokeWidth: 2
              }}
              fill="url(#jailbreakGradient)"
              name="Jailbreak Rate"
              stroke="#ef4444"
              strokeWidth={2}
              type="monotone"
              yAxisId="jailbreak"
            />
            <Area
              activeDot={{
                r: 6,
                fill: "#ffffff",
                stroke: "#000000",
                strokeWidth: 2
              }}
              dataKey="fpRate"
              dot={{
                r: 3,
                fill: "#000000",
                stroke: "#ffffff",
                strokeWidth: 2
              }}
              fill="url(#fpGradient)"
              name="False Positive Rate"
              stroke="#ffffff"
              strokeWidth={2}
              type="monotone"
              yAxisId="fp"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
