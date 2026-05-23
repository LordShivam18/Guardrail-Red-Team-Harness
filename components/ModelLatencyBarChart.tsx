"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { ModelComparisonSummary } from "@/lib/db";

type ModelLatencyBarChartProps = {
  summaries: ModelComparisonSummary[];
};

type LatencyPoint = {
  modelName: string;
  chartLabel: string;
  averageLatencyMs: number;
  latencyTracked: boolean;
  defusalSuccessRate: number;
};

type TooltipPayload = {
  payload?: LatencyPoint;
};

type LatencyTooltipProps = {
  active?: boolean;
  payload?: TooltipPayload[];
};

function compactModelName(modelName: string) {
  return modelName
    .replace(/-Guarded-v\d+$/i, "")
    .replace(/Gemini-/i, "Gemini ")
    .replace(/-/g, " ");
}

function formatLatency(value: number) {
  return `${Math.round(value).toLocaleString()} ms`;
}

function LatencyTooltip({ active, payload }: LatencyTooltipProps) {
  const point = payload?.[0]?.payload;

  if (!active || !point) {
    return null;
  }

  return (
    <div className="min-w-64 rounded-lg border border-white/10 bg-slate-950/95 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {point.modelName}
      </p>
      <div className="mt-3 grid gap-2 text-sm">
        <div className="flex items-center justify-between gap-5">
          <span className="text-cyan-100">Average Latency</span>
          <span className="font-semibold text-slate-50">
            {point.latencyTracked ? formatLatency(point.averageLatencyMs) : "Not tracked"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-5">
          <span className="text-emerald-100">Defusal Rate</span>
          <span className="font-semibold text-emerald-100">
            {point.defusalSuccessRate.toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
}

export function ModelLatencyBarChart({ summaries }: ModelLatencyBarChartProps) {
  const chartData = useMemo<LatencyPoint[]>(
    () =>
      summaries.map((summary) => ({
        modelName: summary.modelName,
        chartLabel: compactModelName(summary.modelName),
        averageLatencyMs: summary.averageLatencyMs ?? 0,
        latencyTracked: summary.averageLatencyMs !== null,
        defusalSuccessRate: summary.defusalSuccessRate
      })),
    [summaries]
  );

  if (chartData.length === 0) {
    return (
      <div className="grid h-72 place-items-center rounded-lg border border-slate-800 bg-slate-900/45 text-sm text-slate-500">
        No latency data available.
      </div>
    );
  }

  return (
    <div className="h-[24rem] rounded-lg border border-white/10 bg-slate-950/70 px-2 py-5 sm:px-4">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{
            bottom: 16,
            left: 12,
            right: 28,
            top: 10
          }}
        >
          <defs>
            <linearGradient id="latencyBarGradient" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.82} />
              <stop offset="58%" stopColor="#34d399" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.76} />
            </linearGradient>
          </defs>
          <CartesianGrid
            horizontal={false}
            stroke="rgba(148, 163, 184, 0.15)"
            strokeDasharray="4 8"
          />
          <XAxis
            axisLine={false}
            tickFormatter={(value) => formatLatency(Number(value))}
            tickLine={false}
            stroke="#64748b"
            type="number"
          />
          <YAxis
            axisLine={false}
            dataKey="chartLabel"
            tickLine={false}
            stroke="#cbd5e1"
            type="category"
            width={150}
          />
          <Tooltip
            content={<LatencyTooltip />}
            cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
          />
          <Bar
            background={{ fill: "rgba(15, 23, 42, 0.72)", radius: 8 }}
            dataKey="averageLatencyMs"
            fill="url(#latencyBarGradient)"
            maxBarSize={28}
            radius={[0, 8, 8, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
