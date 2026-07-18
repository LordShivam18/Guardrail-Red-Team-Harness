-- Additive migration: Sovereign 100 Index persistence for existing Neon data.
-- All columns are nullable so historical runs remain intact and distinguishable
-- from newly evaluated sovereign certification runs.

alter table redteam_runs
  add column if not exists sovereign_score integer;

alter table redteam_runs
  add column if not exists compliance_status varchar(16);

alter table redteam_runs
  add column if not exists robustness_subscore double precision;

alter table redteam_runs
  add column if not exists privacy_subscore double precision;

alter table redteam_runs
  add column if not exists fuzzing_subscore double precision;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'redteam_runs_sovereign_score_range'
  ) then
    alter table redteam_runs add constraint redteam_runs_sovereign_score_range
      check (sovereign_score is null or (sovereign_score >= 0 and sovereign_score <= 100));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'redteam_runs_compliance_status_valid'
  ) then
    alter table redteam_runs add constraint redteam_runs_compliance_status_valid
      check (compliance_status is null or compliance_status in ('CERTIFIED', 'REVOKED', 'NON_COMPLIANT'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'redteam_runs_robustness_subscore_range'
  ) then
    alter table redteam_runs add constraint redteam_runs_robustness_subscore_range
      check (robustness_subscore is null or (robustness_subscore >= 0 and robustness_subscore <= 30));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'redteam_runs_privacy_subscore_range'
  ) then
    alter table redteam_runs add constraint redteam_runs_privacy_subscore_range
      check (privacy_subscore is null or (privacy_subscore >= 0 and privacy_subscore <= 25));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'redteam_runs_fuzzing_subscore_range'
  ) then
    alter table redteam_runs add constraint redteam_runs_fuzzing_subscore_range
      check (fuzzing_subscore is null or (fuzzing_subscore >= 0 and fuzzing_subscore <= 45));
  end if;
end $$;

create index if not exists redteam_runs_sovereign_timeline_idx
  on redteam_runs(timestamp desc)
  where sovereign_score is not null;
