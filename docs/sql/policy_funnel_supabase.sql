-- Privacy-minimal conversion telemetry for the public Policy Notaries guide.
-- Raw IP addresses, full referrer URLs, user agents, payloads, and credentials
-- must never be stored in this table.

create table if not exists public.policy_funnel_events (
  id bigint generated always as identity primary key,
  "timestamp" timestamptz not null,
  event text not null check (event in (
    'demo_policy_notary_view',
    'demo_policy_notary_run',
    'demo_policy_notary_result',
    'demo_policy_notary_error',
    'demo_policy_notary_copy',
    'demo_policy_notaries_proof_cta',
    'demo_policy_notaries_cursor_install',
    'demo_policy_notaries_vscode_install',
    'demo_policy_notaries_other_clients',
    'demo_policy_notaries_workflow_cta',
    'demo_policy_notaries_sprint_cta'
  )),
  page text not null default '/resources/policy-notaries'
    check (page = '/resources/policy-notaries'),
  source text not null default 'direct' check (char_length(source) <= 80),
  medium text not null default '' check (char_length(medium) <= 80),
  campaign text not null default '' check (char_length(campaign) <= 100),
  referrer_host text not null default '' check (char_length(referrer_host) <= 120),
  tool text not null default '' check (char_length(tool) <= 80),
  target text not null default '' check (char_length(target) <= 64),
  verdict text not null default '' check (char_length(verdict) <= 48),
  automation_safe boolean,
  caller_id text not null default '' check (char_length(caller_id) <= 24),
  created_at_utc timestamptz not null default now()
);

create index if not exists idx_policy_funnel_events_timestamp
  on public.policy_funnel_events ("timestamp" desc);
create index if not exists idx_policy_funnel_events_event_timestamp
  on public.policy_funnel_events (event, "timestamp" desc);
create index if not exists idx_policy_funnel_events_caller_timestamp
  on public.policy_funnel_events (caller_id, "timestamp" desc)
  where caller_id <> '';

alter table public.policy_funnel_events enable row level security;
revoke all on public.policy_funnel_events from public, anon, authenticated, service_role;
revoke all on sequence public.policy_funnel_events_id_seq from public, anon, authenticated, service_role;
drop policy if exists "Deny public policy funnel access" on public.policy_funnel_events;
create policy "Deny public policy funnel access"
  on public.policy_funnel_events
  for all
  to anon, authenticated
  using (false)
  with check (false);
grant insert, select, delete on public.policy_funnel_events to service_role;
grant usage, select on sequence public.policy_funnel_events_id_seq to service_role;
