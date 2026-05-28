"use client";

import { type ReactNode, useState } from "react";

type Tab = "sandbox" | "fuzzer";

type ToolingTabsProps = {
  sandboxSlot: ReactNode;
  fuzzerSlot: ReactNode;
};

const TABS: { id: Tab; label: string }[] = [
  { id: "sandbox", label: "Sandbox" },
  { id: "fuzzer", label: "Auto-Fuzzer" }
];

export function ToolingTabs({ sandboxSlot, fuzzerSlot }: ToolingTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("sandbox");

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
        {activeTab === "sandbox" ? sandboxSlot : fuzzerSlot}
      </div>
    </div>
  );
}
