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
- `review_only`: the modeled contract cannot make a complete decision.
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

Persistent failures and unresolved changes are review queues, not automatic
retirements. Failure counters may be null on older monitor snapshots: missing
instrumentation is not zero failures. A replaced source explicitly clears its
old per-scope review date. Human review and source burn-in must precede reopening.

The private Ops MCP page consumes this same catalogue through a bounded GET,
without forwarding private credentials or calling tools. Its loader rejects
inconsistent counts, stale report metadata, duplicate scopes and unsafe links.
