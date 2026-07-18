-- Phase 4: durable model lifecycle state for post-market drift alerts.
-- A model version starts VERIFIED and becomes PENDING_REASSESSMENT when the
-- signed drift monitor reports a KL divergence above the approved threshold.

alter table redteam_runs
  add column if not exists model_status varchar(32);

update redteam_runs
set model_status = 'VERIFIED'
where model_status is null;

alter table redteam_runs
  alter column model_status set default 'VERIFIED';

alter table redteam_runs
  alter column model_status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'redteam_runs_model_status_valid'
  ) then
    alter table redteam_runs add constraint redteam_runs_model_status_valid
      check (model_status in ('VERIFIED', 'PENDING_REASSESSMENT'));
  end if;
end $$;

create index if not exists redteam_runs_model_status_timestamp_idx
  on redteam_runs (model_status, timestamp desc);
