# Policy support catalogue v1

`GET https://policy.decide.fyi/api/policy-support` is a public, read-only,
bounded catalogue of Decide Services' Policy Notaries. It has no customer data,
authentication tokens, tool-call payloads or action authority.

Optional single filters: `policy=refund|cancel|return|trial`, `vendor=<known-id>`.
Invalid or repeated filters return 400; methods other than GET return 405.
Unknown well-formed vendor IDs return an empty filtered list. Summary counts
describe only the returned scope population. The complete response is bounded
at 1,000 scopes; the current configured catalogue contains 401.

The schema identity is `policy_support_catalogue_v1`. Every row identifies its
policy, vendor, US individual scope, configured mode, source URL/hash, reviewed
date/deadline and current evidence status. Summary and row status agree:

- `supported`: decision-capable configuration and current trusted evidence;
  request applicability and complete context remain required.
- `unsupported`: the modeled contract or its qualification cannot support an
  automated decision. It is not offered as a manual service.
- `observed_offer`: trial terms must come from the actual account offer.
- `retired`: explicit scoped exclusion; retained for history, not automatic use.
- `degraded`: decision-capable scope without currently valid evidence.

`execution_authority` is always `none`. Never use this catalogue instead of
evaluating the actual policy request. The engine checks evidence again.

The same provenance-validated, catalogue-hash-matched runtime snapshot supplies
monitoring information. Missing/stale/mismatched evidence is marked unavailable;
no checked-in report or stale fallback becomes live evidence. Responses are
not stored by HTTP caches; the existing server-side evidence cache remains
bounded. The endpoint does not fetch vendors or trigger GitHub Actions.

Persistent failures and unresolved changes are engineering diagnostics, not owner
tasks or automatic retirements. Failure counters may be null on older monitor snapshots: missing
instrumentation is not zero failures. A replaced source explicitly clears its
old per-scope qualification date. A tested applicability qualification and source
burn-in must precede any later capability update that reopens it.

## No-owner operating model

`operating_model: automated_or_unavailable` and `operator_review_required: false`
describe service operation, not blanket support. Missing, changed, expired or
persistently failing evidence withholds automated availability without waiting
for the owner. Seven consecutive failed checks are enforced at the runtime
evidence gate; one transient outage can still use unexpired trusted evidence.
History is retained. Unsupported scopes stay off unless a later tested capability
update requalifies them; no owner maintenance queue is required to keep the
remaining service running. Existing qualification deadlines are not renewed by
fetch success. These bounds are not a promise of permanent coverage.

The existing `review_required`/`UNKNOWN` compatibility outcomes remain fail-closed;
they do not mean Decide supplies a human review service. A caller's own business
workflow may intentionally use the Runtime's `review` verdict, separately from
source maintenance.

The private Ops MCP page consumes this same catalogue through a bounded GET,
without forwarding private credentials or calling tools. Its loader rejects
inconsistent counts, stale report metadata, duplicate scopes and unsafe links.
Ops shows automated availability and exclusion diagnostics, not owner tasks.
