-- Privacy-minimal MCP adoption telemetry. Raw IP addresses, request payloads,
-- support questions, and credentials must never be stored in this table.

create table if not exists public.mcp_usage_events (
  id bigint generated always as identity primary key,
  "timestamp" timestamptz not null,
  surface text not null default '',
  host text not null default '',
  method text not null default '',
  tool text not null default '',
  result text not null default '',
  verdict text not null default '',
  code text not null default '',
  latency_ms integer not null default 0 check (latency_ms >= 0),
  client text not null default 'other',
  caller_id text not null default '',
  created_at_utc timestamptz not null default timezone('utc', now())
);

create index if not exists idx_mcp_usage_events_timestamp
  on public.mcp_usage_events ("timestamp" desc);
create index if not exists idx_mcp_usage_events_tool_timestamp
  on public.mcp_usage_events (tool, "timestamp" desc);
create index if not exists idx_mcp_usage_events_caller_timestamp
  on public.mcp_usage_events (caller_id, "timestamp" desc)
  where caller_id <> '';

alter table public.mcp_usage_events enable row level security;
revoke all on public.mcp_usage_events from anon, authenticated;
drop policy if exists "Deny public MCP telemetry access" on public.mcp_usage_events;
create policy "Deny public MCP telemetry access"
  on public.mcp_usage_events
  for all
  to anon, authenticated
  using (false)
  with check (false);
grant insert, select, delete on public.mcp_usage_events to service_role;
grant usage, select on sequence public.mcp_usage_events_id_seq to service_role;

create or replace view public.mcp_usage_daily
with (security_invoker = true)
as
select
  date_trunc('day', "timestamp")::date as date_utc,
  surface,
  tool,
  client,
  count(*)::bigint as tool_calls,
  count(distinct nullif(caller_id, ''))::bigint as known_unique_callers,
  count(*) filter (where result <> 'success')::bigint as non_successful_calls,
  round(avg(latency_ms)::numeric, 2) as average_latency_ms
from public.mcp_usage_events
where method = 'tools/call'
group by 1, 2, 3, 4;

revoke all on public.mcp_usage_daily from anon, authenticated;
grant select on public.mcp_usage_daily to service_role;
