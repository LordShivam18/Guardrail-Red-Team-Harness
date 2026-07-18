-- Additive storage for privacy-preserving ART lineage metadata.
-- Prompt and target-response bodies are intentionally excluded; only hashes,
-- fitness values, generation numbers, and mutation labels are retained.

alter table redteam_runs
  add column if not exists evolutionary_lineage jsonb;

create index if not exists redteam_runs_evolutionary_lineage_idx
  on redteam_runs using gin (evolutionary_lineage)
  where evolutionary_lineage is not null;
