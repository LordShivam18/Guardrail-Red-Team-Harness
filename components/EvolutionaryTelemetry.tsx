"use client";

export type EvolutionaryTelemetrySnapshot = {
  activeGeneration: number;
  maxFitnessBound: number;
  mutationStrategy: string;
  terminalReadout: readonly string[];
};

type EvolutionaryTelemetryProps = {
  telemetry: EvolutionaryTelemetrySnapshot;
};

/** Metadata-only ART telemetry; prompt and target-response bodies are never rendered. */
export function EvolutionaryTelemetry({ telemetry }: EvolutionaryTelemetryProps) {
  return (
    <section className="border border-neutral-800 bg-black font-mono text-white">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <p className="text-[10px] font-bold tracking-[0.24em] text-neutral-400">
          ART // EVOLUTIONARY TELEMETRY
        </p>
        <span className="border border-neutral-700 px-2 py-1 text-[10px] text-neutral-300">LIVE SIGNAL</span>
      </div>
      <div className="grid grid-cols-1 border-b border-neutral-800 sm:grid-cols-3">
        <div className="border-b border-neutral-800 px-4 py-3 sm:border-b-0 sm:border-r">
          <p className="text-[10px] tracking-wider text-neutral-500">ACTIVE GENERATION</p>
          <p className="mt-1 text-2xl font-black">{telemetry.activeGeneration || "--"}</p>
        </div>
        <div className="border-b border-neutral-800 px-4 py-3 sm:border-b-0 sm:border-r">
          <p className="text-[10px] tracking-wider text-neutral-500">MAX FITNESS BOUND</p>
          <p className="mt-1 text-2xl font-black">{telemetry.maxFitnessBound.toFixed(0)} / 100</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[10px] tracking-wider text-neutral-500">MUTATION_STRATEGY</p>
          <p className="mt-2 break-words text-xs font-bold text-amber-300">{telemetry.mutationStrategy}</p>
        </div>
      </div>
      <div className="min-h-24 max-h-36 overflow-y-auto px-4 py-3 text-[11px] leading-5 text-neutral-400">
        {telemetry.terminalReadout.length > 0 ? (
          telemetry.terminalReadout.slice(-5).map((line, index) => <p key={`${line}-${index}`}>› {line}</p>)
        ) : (
          <p className="text-neutral-600">› Awaiting authorized evolutionary worker telemetry.</p>
        )}
      </div>
    </section>
  );
}
