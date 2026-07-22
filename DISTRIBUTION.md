# Policy MCP Distribution

The canonical distribution unit is **Decide Policy Notaries**: one MCP server
with four fail-closed tools for refund, cancellation, return, and live-trial
policy checks.

Canonical endpoint:

```text
https://policy.decide.fyi/api/mcp
```

Canonical product and install guide:

```text
https://www.decide.fyi/resources/policy-notaries
```

The four specialist endpoints remain stable compatibility surfaces. Do not
remove or redirect them in a way that breaks existing clients.

## Source-Controlled Operations

- `distribution/mcp-directories.json` is the canonical ownership ledger for
  primary registries, client-integrated catalogs, downstream aggregators, and
  monitor-only mirrors.
- Its `directory_submission_profile` is the source of truth for directory
  names, descriptions, links, tags, tool names, and client configuration. Do
  not improvise separate copy in each catalog.
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

- **Smithery canonical suite:** `decidefyi/policy-notaries` is live at
  `https://smithery.ai/servers/decidefyi/policy-notaries`. Its external release
  points to `https://policy.decide.fyi/api/mcp`; Smithery discovered the
  well-known server card and verified the exact four-tool suite. The catalog
  uses the canonical Decide icon and reports a 99/100 quality score. The final
  cosmetic point favors dot-separated tool names, so the stable public tool
  contract takes precedence. A managed Smithery connection has also completed
  a source-backed refund tool call.
- **Smithery Refund compatibility:** `refund-decide/notary` retains its usage
  history, but belongs to a different Smithery owner than the current
  `decidefyi` identity. Preserve that qualified name; request ownership transfer
  or a metadata correction before describing it as the Refund-only
  compatibility endpoint.
- **Official MCP Registry:** the active legacy record is
  `io.github.ndkasndakn/refund-decide@1.0.0`. Registry versions are immutable and
  cannot currently be unpublished.
- **Canonical Registry identity:**
  `io.github.decidefyi/policy-notaries@1.3.1` is active and points to the
  canonical four-tool remote. Publish another immutable version only for a
  material endpoint or tool-contract change.
- **awesome-mcp-servers:** correction PR #1830 remains open in manual review.
  It describes the canonical suite under Support & Service Management, removes
  the old refund-only entry, and includes the required live Glama badge. GitHub
  still shows stale `duplicate` and `missing-glama` labels, no review decision,
  and an indeterminate merge state. The relocation clarification was posted on
  2026-07-18; wait until after 2026-07-25 before one concise follow-up, and do
  not open another submission.
- **Glama:** the live catalog describes the four-tool deterministic policy
  suite and canonical repository. Repository install metadata now points at the
  canonical `policy.decide.fyi` server; allow the crawler to absorb the latest
  README refresh. No duplicate listing or manual sync is currently needed.
- **MCP.so:** the canonical remote is in the no-cost review queue. Its draft is
  not public yet and still needs to be normalized against the source-controlled
  submission profile from an authenticated MCP.so session.

## Client-Integrated Expansion Wave

The next acquisition layer is client-integrated distribution, not another set
of generic MCP mirrors. Source-controlled packages are ready for:

- **OpenAI plugin directory:** `chatgpt-app-submission.json` contains all four
  tool-hint justifications, five positive review tests, and three negative
  tests. `distribution/submissions/openai-plugin.md` records the portal fields
  and account prerequisites.
- **Anthropic Connectors Directory:**
  `distribution/submissions/anthropic-connectors.md` contains the listing,
  connection, data-handling, use-case, and reviewer-test fields. Submission
  requires a Claude Team or Enterprise organization with directory-management
  access.
- **Cursor Marketplace:** `.cursor-plugin/marketplace.json` and
  `decide-policy-notaries/` form a self-contained, MIT-licensed remote-MCP
  plugin with a local icon and safe support-policy skill. Submit the public
  repository after the package is committed and its paths are validated.
- **Docker MCP Catalog:**
  `distribution/submissions/docker-mcp-registry/decide-policy-notaries/`
  contains the required remote `server.yaml`, empty dynamic `tools.json`, and
  documentation link. Upstream PR #4471 is open for review.

Run `npm run test:mcp-marketplaces` before any marketplace submission. All
surfaces must retain the same endpoint, tool names, fail-closed scope, and
product links from `directory_submission_profile`.

## Release Sequence

1. Completed: deploy `policy.decide.fyi/api/mcp` and verify `initialize`,
   `tools/list`, and all four `tools/call` paths from outside Vercel.
2. Confirm the Smithery Refund release type and upstream URL. Do not replace or
   delete the existing qualified name.
3. Completed: publish `io.github.decidefyi/policy-notaries@1.3.1` to the
   Official MCP Registry from the `decidefyi` organization identity.
4. Completed: publish **Decide Policy Notaries** at
   `decidefyi/policy-notaries` from the canonical URL. Smithery scanned the
   live endpoint and server card, discovering the exact four-tool suite.
5. Request ownership transfer or a metadata correction for the existing Refund
   Smithery page, then point its description to the four-tool suite while
   preserving Refund compatibility and usage history. The current `decidefyi`
   Smithery identity cannot edit that legacy qualified name.
6. Completed: verify Glama's `decidefyi/decide` catalog page exposes the
   canonical four-tool install configuration. Claim ownership or manually sync
   only if a future material repository change does not recrawl.
7. In progress: merge awesome-mcp-servers PR #1830, which describes all four
   tools and moves the entry to Support & Service Management. The current diff
   is clean, mergeable, and includes the live Glama score badge; monitor the
   maintainer response to the stale-label clarification.
8. Let PulseMCP and other registry aggregators ingest the Official MCP Registry
   record. Submit manually only if the canonical entry remains absent after an
   indexing window.
9. Submitted: MCP.so accepted `https://policy.decide.fyi/api/mcp` as the one
   canonical suite through its free queued-review path on 2026-07-18. Its page
   is not public while queued. Normalize the draft against
   `directory_submission_profile` before publication; do not pay to skip the
   review queue without measured acquisition value.
10. Let downstream mirrors refresh from those canonical sources before filing
    individual correction requests.
11. Publish the Cursor package, validate the committed repository, and submit
    it to Cursor Marketplace review.
12. In progress: merge Docker MCP Registry PR #4471 for the canonical remote
    server, then verify the catalog install after publication.
13. Use account-qualified organizations to submit the prepared OpenAI and
    Anthropic directory packets. These are account/reviewer gates, not further
    product-development projects.

## When To Resubmit

- **Official MCP Registry:** publish a new immutable version when the canonical
  remote, public metadata, or tool contract changes. Do nothing for unchanged
  releases.
- **Smithery:** publish a new release for endpoint, connection, or tool-contract
  changes. Edit descriptive metadata for positioning changes. Preserve the
  Refund listing and its history.
- **awesome-mcp-servers / MCP.so:** correct material product identity, endpoint,
  or tool-set changes. Do not file a directory update for every code release.
- **OpenAI / Anthropic / Cursor / Docker:** update the existing listing or
  plugin version after a material tool-contract, scope, privacy, endpoint, or
  reviewed-metadata change. Do not create duplicate directory identities.
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

Run the aggregate-only operator report from an environment that has the
server-side Supabase variables:

```bash
npm run report:mcp-adoption -- --days=30
```

It separates discovery, generic probes, completed policy evaluations, and
invalid evaluations. It emits counts only; it never writes raw caller IPs or
tool payloads.

Review after 30 days:

- completed policy evaluations and review-required rate by tool
- known repeat evaluators across multiple UTC days, when the telemetry salt is configured
- invalid evaluations, generic probes, and client-family mix
- directory referral and install attribution from directory/platform or website analytics

MCP telemetry does not identify referral source, paying customers, or
docs-to-install conversion. Directory call counters are discovery signals, not
customer or revenue proof.
