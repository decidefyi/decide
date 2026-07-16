# Policy MCP Distribution

The canonical distribution unit is **Decide Policy Notaries**: one MCP server
with four deterministic tools for refund, cancellation, return, and trial policy
checks.

Canonical endpoint:

```text
https://policy.decide.fyi/api/mcp
```

The four specialist endpoints remain stable compatibility surfaces. Do not
remove or redirect them in a way that breaks existing clients.

## Source-Controlled Operations

- `distribution/mcp-directories.json` is the canonical ownership ledger for
  primary registries, client-integrated catalogs, downstream aggregators, and
  monitor-only mirrors.
- `npm run audit:mcp-distribution -- --strict` verifies the local manifest,
  production initialization, exact four-tool set, published tool metadata, and
  Official MCP Registry state.
- **MCP distribution health** runs that check daily and uploads a machine-readable
  report. Missing directory coverage is an action item; an unavailable or
  incomplete canonical endpoint is a failure.
- **Publish canonical MCP registry version** uses GitHub OIDC and accepts only a
  version that exactly matches `server.json`. It refuses publication while
  production still serves older tool metadata.

Directory state is not maintained in prose alone. Update the inventory evidence
and action when a submission, rescan, or registry release completes.

## Current External State

- **Smithery:** `refund-decide/notary` is the only Decide listing with retained
  usage history. Preserve that qualified name and describe it as the Refund-only
  compatibility endpoint after the canonical suite is live.
- **Official MCP Registry:** the active legacy record is
  `io.github.ndkasndakn/refund-decide@1.0.0`. Registry versions are immutable and
  cannot currently be unpublished.
- **Canonical Registry identity:**
  `io.github.decidefyi/policy-notaries@1.3.0` is active and points to the
  canonical four-tool remote. Publish another immutable version only for a
  material endpoint or tool-contract change.
- **awesome-mcp-servers:** correction PR #1830 is open, mergeable, and passing
  the required Glama check. It describes the canonical suite under Support &
  Service Management; do not open a duplicate submission.
- **Repo crawlers:** Glama recognizes all four policy tools. Its cached install
  copy still predates the canonical four-tool one-click configuration and should
  update on the next repository crawl.

## Release Sequence

1. Completed: deploy `policy.decide.fyi/api/mcp` and verify `initialize`,
   `tools/list`, and all four `tools/call` paths from outside Vercel.
2. Confirm the Smithery Refund release type and upstream URL. Do not replace or
   delete the existing qualified name.
3. Completed: publish `io.github.decidefyi/policy-notaries@1.3.0` to the
   Official MCP Registry from the `decidefyi` organization identity.
4. Publish a new Smithery server named **Decide Policy Notaries** from the
   canonical URL. Let Smithery scan the live endpoint and generated server card.
5. Update the existing Refund Smithery description to point to the four-tool
   suite while preserving Refund compatibility and usage history.
6. Re-run Glama's Claim ownership or manual Sync Server flow for the
   `decidefyi/decide` organization repository, then verify the canonical
   four-tool install copy.
7. In progress: merge awesome-mcp-servers PR #1830, which describes all four
   tools and moves the entry to Support & Service Management.
8. Let PulseMCP and other registry aggregators ingest the Official MCP Registry
   record. Submit manually only if the canonical entry remains absent after an
   indexing window.
9. Submit the one canonical suite to MCP.so, then keep it only if referral or
   install activity justifies direct maintenance.
10. Let downstream mirrors refresh from those canonical sources before filing
   individual correction requests.

## When To Resubmit

- **Official MCP Registry:** publish a new immutable version when the canonical
  remote, public metadata, or tool contract changes. Do nothing for unchanged
  releases.
- **Smithery:** publish a new release for endpoint, connection, or tool-contract
  changes. Edit descriptive metadata for positioning changes. Preserve the
  Refund listing and its history.
- **awesome-mcp-servers / MCP.so:** correct material product identity, endpoint,
  or tool-set changes. Do not file a directory update for every code release.
- **Glama / PulseMCP / mirrors:** first refresh the repository and Official MCP
  Registry. Escalate manually only for persistent absence, meaningful traffic,
  or harmful false claims.

## Do Not Fragment The Listing

Do not publish three additional isolated Smithery pages for Cancel, Return, and
Trial unless measured search demand justifies them. Four installs split usage,
reviews, trust signals, and maintenance. The specialist URLs exist for runtime
compatibility; the suite is the discovery and installation product.

## Measurement Contract

Count `tools/call` separately from `initialize`, `notifications/initialized`,
`ping`, and `tools/list`. Track only operational metadata needed for adoption
analysis:

- timestamp and host
- MCP method and selected tool
- response status and latency
- coarse client user agent
- repeat caller identifier derived without storing raw IP addresses

Do not log support questions, policy payload contents, API keys, or other
customer data.

The runtime enforces this through privacy-minimal MCP telemetry. Set a stable,
secret `MCP_TELEMETRY_SALT` in production to enable repeat-caller measurement;
without it, `caller_id` is intentionally empty. The persisted event contains
only host, MCP method, selected tool, coarse client family, result, verdict/code,
latency, and the salted identifier.

Set `MCP_TELEMETRY_SUPABASE_ENABLED=1` to retain those events in the private
`mcp_usage_events` table created by `docs/sql/mcp_telemetry_supabase.sql`. RLS
and grants deny `anon` and `authenticated`; only the server-side service role
can write or query the table. `mcp_usage_daily` provides a tools-call-only
rollup without storing request contents.

Review after 30 days:

- unique callers that completed at least one `tools/call`
- repeat callers across multiple days
- calls and errors by tool
- Smithery client mix and source channel
- documentation-to-install and install-to-call conversion

Directory call counters are discovery signals, not customer or revenue proof.
