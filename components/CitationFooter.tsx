"use client";

import { useState } from "react";

const BIBTEX = `@misc{guardrailmesh2025,
  title={mesh-seed-v1: Adversarial Red-Team Seed Benchmark for LLM Safety},
  author={Guardrail Mesh},
  year={2025},
  url={https://huggingface.co/datasets/guardrail-mesh/mesh-seed-v1}
}`;

export function CitationFooter() {
  const [copied, setCopied] = useState(false);

  async function copyBibtex() {
    await navigator.clipboard.writeText(BIBTEX);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="rounded-md border border-neutral-800 bg-neutral-950 p-5 text-left">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
            Cite this evaluation
          </p>
          <div className="mt-3 space-y-2 text-sm leading-6 text-neutral-400">
            <p>Guardrail Mesh Evaluation Framework v1.0 (2025).</p>
            <p>
              mesh-seed-v1: An Adversarial Red-Team Seed Benchmark for LLM Safety
              Evaluation.
            </p>
            <p className="break-all">
              Dataset:{" "}
              <a
                className="text-neutral-200 underline decoration-neutral-700 underline-offset-4 transition hover:text-white"
                href="https://huggingface.co/datasets/guardrail-mesh/mesh-seed-v1"
              >
                https://huggingface.co/datasets/guardrail-mesh/mesh-seed-v1
              </a>
            </p>
            <p className="break-all">
              Registry:{" "}
              <a
                className="text-neutral-200 underline decoration-neutral-700 underline-offset-4 transition hover:text-white"
                href="https://guardrail-red-team-harness.vercel.app/registry"
              >
                https://guardrail-red-team-harness.vercel.app/registry
              </a>
            </p>
            <p className="break-all">
              Certificate verification:{" "}
              <span className="font-mono text-neutral-200">/api/verify?cert=&lt;HASH&gt;</span>
            </p>
          </div>
        </div>

        <button
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-black px-4 font-mono text-xs font-bold uppercase text-neutral-300 transition hover:border-neutral-500 hover:text-white focus:outline-none focus:ring-1 focus:ring-neutral-500"
          onClick={copyBibtex}
          type="button"
        >
          {copied ? "Copied" : "Copy BibTeX"}
        </button>
      </div>
    </section>
  );
}
