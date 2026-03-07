-- Supabase schema for policy-check operational state.
-- Apply in Supabase SQL Editor once per project.

create extension if not exists pgcrypto;

create table if not exists public.policy_events (
  event_id text primary key,
  emitted_at_utc timestamptz not null,
  date_utc date not null,
  policy text not null,
  vendor text not null,
  confirmed_hash text,
  previous_hash text,
  semantic_diff_summary text,
  source_url text,
  rules_file text,
  run_id text,
  run_attempt text,
  commit_sha text,
  run_url text,
  raw jsonb not null default '{}'::jsonb,
  updated_at_utc timestamptz not null default timezone('utc', now())
);

create index if not exists idx_policy_events_date_utc on public.policy_events (date_utc desc);
create index if not exists idx_policy_events_policy_vendor on public.policy_events (policy, vendor);
create index if not exists idx_policy_events_emitted_at on public.policy_events (emitted_at_utc desc);

create table if not exists public.policy_daily_alerts (
  date_utc date primary key,
  generated_at_utc timestamptz not null,
  strict_eligible boolean not null default false,
  changed_count int not null default 0,
  dedupe_changed_count int not null default 0,
  reported_changed_count int not null default 0,
  repeated_count int not null default 0,
  by_policy jsonb not null default '{}'::jsonb,
  changed_sample jsonb not null default '[]'::jsonb,
  pending_count int not null default 0,
  volatile_pending_count int not null default 0,
  escalation_count int not null default 0,
  coverage_gap_count int not null default 0,
  fetch_failure_count int not null default 0,
  fetch_health_status text not null default 'unknown',
  fetch_blocked_pending_count int not null default 0,
  quality_gate_held_count int not null default 0,
  metadata_stability_held_count int not null default 0,
  material_oscillation_suppressed_count int not null default 0,
  source_migration_reset_count int not null default 0,
  signal_confidence text not null default 'manual-review',
  signal_confidence_reason text not null default '',
  status text not null default 'review',
  state text not null default 'needs_review',
  run_id text,
  run_attempt text,
  commit_sha text,
  run_url text,
  source text not null default 'check-policies.js',
  raw jsonb not null default '{}'::jsonb,
  updated_at_utc timestamptz not null default timezone('utc', now())
);

create index if not exists idx_policy_daily_alerts_generated_at on public.policy_daily_alerts (generated_at_utc desc);
create index if not exists idx_policy_daily_alerts_strict on public.policy_daily_alerts (strict_eligible, date_utc desc);
create index if not exists idx_policy_daily_alerts_state on public.policy_daily_alerts (state, date_utc desc);

create table if not exists public.policy_state_artifacts (
  artifact_path text primary key,
  content_text text not null,
  content_sha256 text not null,
  run_id text,
  run_attempt text,
  commit_sha text,
  source text not null default 'check-policies.js',
  updated_at_utc timestamptz not null default timezone('utc', now())
);

create index if not exists idx_policy_state_artifacts_updated_at
  on public.policy_state_artifacts (updated_at_utc desc);
