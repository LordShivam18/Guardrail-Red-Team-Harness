"use client";

import { type ReactNode, useState } from "react";

type Tab = "sandbox" | "fuzzer" | "pareto" | "whitebox";

type ToolingTabsProps = {
  sandboxSlot: ReactNode;
  fuzzerSlot: ReactNode;
  paretoSlot: ReactNode;
  whiteboxSlot: ReactNode;
};

const TABS: { id: Tab; label: string }[] = [
  { id: "sandbox", label: "SANDBOX" },
  { id: "fuzzer", label: "AUTO-FUZZER" },
  { id: "pareto", label: "PARETO FRONTIER" },
  { id: "whitebox", label: "WHITEBOX" }
];

export function ToolingTabs({
  fuzzerSlot,
  paretoSlot,
  sandboxSlot,
  whiteboxSlot
}: ToolingTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("sandbox");
  const activeSlot =
    activeTab === "sandbox"
      ? sandboxSlot
      : activeTab === "fuzzer"
        ? fuzzerSlot
        : activeTab === "pareto"
          ? paretoSlot
          : whiteboxSlot;

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-0 border-b border-neutral-800">
        {TABS.map((tab) => (
          <button
            className={`px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider transition ${
              activeTab === tab.id
                ? "border-b-2 border-white text-white"
                : "text-neutral-600 hover:text-neutral-300"
            }`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-4">
        {activeSlot}
      </div>
    </div>
  );
}
