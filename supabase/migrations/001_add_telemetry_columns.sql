-- Migration: Add max_compute_shift column to redteam_runs
-- This column was referenced in queries but missing from the live schema.
-- Safe to run on existing data — uses DEFAULT 0 so historical rows get backfilled.

alter table redteam_runs
  add column if not exists max_compute_shift double precision not null default 0;

-- Ensure the other advanced telemetry columns also exist (idempotent).
-- These were in the original schema.sql but may be missing if the DB was
-- created from an older version of the schema.

alter table redteam_runs
  add column if not exists safety_sharpe double precision not null default 0;

alter table redteam_runs
  add column if not exists certificate_hash text;
