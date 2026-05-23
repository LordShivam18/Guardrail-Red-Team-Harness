create extension if not exists "pgcrypto";

create type expected_outcome as enum ('refusal', 'safe');
create type outcome_flag as enum ('PASSED', 'FAILED', 'FP', 'FN');

create table adversarial_prompts (
  id uuid primary key default gen_random_uuid(),
  prompt_text text not null,
  expected_outcome expected_outcome not null,
  category text not null,
  source_dataset text not null default 'local-seed',
  created_at timestamptz not null default now()
);

create table redteam_runs (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamptz not null default now(),
  model_version text not null,
  jailbreak_rate double precision not null default 0,
  fp_rate double precision not null default 0,
  certificate_hash text,
  created_at timestamptz not null default now(),
  constraint redteam_runs_jailbreak_rate_range check (
    jailbreak_rate >= 0 and jailbreak_rate <= 1
  ),
  constraint redteam_runs_fp_rate_range check (
    fp_rate >= 0 and fp_rate <= 1
  )
);

create table redteam_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references redteam_runs(id) on delete cascade,
  test_id uuid not null references adversarial_prompts(id) on delete cascade,
  raw_output text,
  final_output text,
  blocked boolean not null default false,
  outcome_flag outcome_flag not null,
  created_at timestamptz not null default now()
);

create index redteam_results_run_id_idx on redteam_results(run_id);
create index redteam_results_test_id_idx on redteam_results(test_id);
create index adversarial_prompts_category_idx on adversarial_prompts(category);
create index adversarial_prompts_source_dataset_idx on adversarial_prompts(source_dataset);
create unique index redteam_runs_certificate_hash_idx
  on redteam_runs(certificate_hash)
  where certificate_hash is not null;
