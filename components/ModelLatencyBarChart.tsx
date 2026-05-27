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
    <div className="min-w-64 rounded-md border border-neutral-700 bg-black p-4">
      <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
        {point.modelName}
      </p>
      <div className="mt-3 grid gap-2 text-sm">
        <div className="flex items-center justify-between gap-5">
          <span className="text-neutral-400">Average Latency</span>
          <span className="font-black text-white">
            {point.latencyTracked ? formatLatency(point.averageLatencyMs) : "Not tracked"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-5">
          <span className="text-neutral-400">Defusal Rate</span>
          <span className="font-black text-white">
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
      <div className="grid h-72 place-items-center rounded-md border border-neutral-800 bg-black font-mono text-sm text-neutral-600">
        No latency data available.
      </div>
    );
  }

  return (
    <div className="h-[24rem] rounded-md border border-neutral-800 bg-neutral-950 px-2 py-5 sm:px-4">
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
              <stop offset="0%" stopColor="#ffffff" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#a3a3a3" stopOpacity={0.7} />
            </linearGradient>
          </defs>
          <CartesianGrid
            horizontal={false}
            stroke="rgba(64, 64, 64, 0.5)"
            strokeDasharray="4 8"
          />
          <XAxis
            axisLine={false}
            tickFormatter={(value) => formatLatency(Number(value))}
            tickLine={false}
            stroke="#525252"
            type="number"
          />
          <YAxis
            axisLine={false}
            dataKey="chartLabel"
            tickLine={false}
            stroke="#a3a3a3"
            type="category"
            width={150}
          />
          <Tooltip
            content={<LatencyTooltip />}
            cursor={{ fill: "rgba(64, 64, 64, 0.15)" }}
          />
          <Bar
            background={{ fill: "rgba(0, 0, 0, 0.7)", radius: 4 }}
            dataKey="averageLatencyMs"
            fill="url(#latencyBarGradient)"
            maxBarSize={28}
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
