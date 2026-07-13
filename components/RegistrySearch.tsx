"use client";

import { useCallback, useState } from "react";

type SearchResult = {
  found: boolean;
  modelVersion?: string;
  meshScore?: number;
  tier?: string;
  rank?: number;
};

export function RegistrySearch() {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || isSearching) return;

    setIsSearching(true);
    setResult(null);

    try {
      const response = await fetch(
        `/api/registry/lookup?hash=${encodeURIComponent(trimmed)}`
      );
      const data = (await response.json()) as SearchResult;

      if (!response.ok) {
        throw new Error("Registry lookup failed.");
      }

      setResult(data);
    } catch {
      setResult({ found: false });
    } finally {
      setIsSearching(false);
    }
  }, [query, isSearching]);

  return (
    <div>
      <div className="flex gap-0">
        <input
          className="h-12 flex-1 rounded-none border border-neutral-800 bg-neutral-950 px-4 font-mono text-sm text-white placeholder-neutral-600 outline-none transition focus:border-neutral-600"
          onChange={(e) => {
            setQuery(e.target.value);
            setResult(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch();
          }}
          placeholder="Verify Cryptographic Audit Hash..."
          type="text"
          value={query}
        />
        <button
          className="h-12 rounded-none border border-l-0 border-neutral-800 bg-white px-6 font-mono text-sm font-bold uppercase text-black transition hover:bg-neutral-200 disabled:opacity-40"
          disabled={!query.trim() || isSearching}
          onClick={handleSearch}
          type="button"
        >
          {isSearching ? "Verifying..." : "Verify"}
        </button>
      </div>

      {result && (
        <div className="mt-3 rounded-md border border-neutral-800 bg-neutral-950 p-4">
          {result.found ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-none border border-neutral-700 bg-neutral-900 px-2.5 py-1 font-mono text-[11px] font-bold uppercase text-white">
                ✓ VERIFIED
              </span>
              <span className="font-mono text-sm text-white">
                {result.modelVersion}
              </span>
              <span className="font-mono text-xs text-neutral-500">
                Mesh Score: {result.meshScore} · Rank #{result.rank} · Tier: {result.tier}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="rounded-none border border-red-900/60 bg-red-950/30 px-2.5 py-1 font-mono text-[11px] font-bold uppercase text-red-500">
                ✗ NOT FOUND
              </span>
              <span className="font-mono text-xs text-neutral-500">
                No certified audit matches this hash.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
