const summaryStats = [
  { label: "Prompt library", value: "0" },
  { label: "Runs recorded", value: "0" },
  { label: "Jailbreak rate", value: "0.0%" },
  { label: "False positives", value: "0.0%" }
];

export function DashboardShell() {
  return (
    <main className="min-h-screen bg-slate-50">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Guardrail & Red-Team Harness
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold text-slate-950">
            Measure how models respond to adversarial prompts before they reach production.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-slate-600">
            Track prompt categories, model runs, blocking behavior, and failure modes from a single dashboard.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summaryStats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">{stat.label}</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-950">Run history</h2>
          <p className="mt-2 text-sm text-slate-600">
            Supabase is ready to store adversarial prompts, red-team runs, and per-test outcomes.
          </p>
        </div>
      </section>
    </main>
  );
}
