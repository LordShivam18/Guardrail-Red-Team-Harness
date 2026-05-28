-- Mesh-10K Dynamic Vulnerability Database
-- Stores standardized adversarial payloads for certification runs.

create table if not exists mesh_zero_days (
  id uuid primary key default gen_random_uuid(),
  payload_text text not null,
  vector_category text not null,
  mitre_atlas_id text,
  owasp_llm_id text,
  success_rate_historical double precision not null default 0,
  severity text not null default 'medium',
  created_at timestamptz not null default now(),
  constraint mesh_zero_days_success_rate_range check (
    success_rate_historical >= 0 and success_rate_historical <= 1
  )
);

create index if not exists mesh_zero_days_vector_category_idx
  on mesh_zero_days(vector_category);

create index if not exists mesh_zero_days_severity_idx
  on mesh_zero_days(severity);
