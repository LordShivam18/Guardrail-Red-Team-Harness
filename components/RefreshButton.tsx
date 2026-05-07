"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      aria-busy={isPending}
      className="inline-flex h-10 items-center justify-center rounded-md border border-cyan-400/40 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-400/20 focus:outline-none focus:ring-2 focus:ring-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-70"
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
      type="button"
    >
      {isPending ? "Refreshing..." : "Refresh"}
    </button>
  );
}
