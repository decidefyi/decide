# Decide Policy Notaries for Cursor

This plugin connects Cursor to the public Decide Policy Notaries MCP server and
adds guidance for safe support-policy checks.

## Included tools

- `refund_eligibility`
- `cancellation_penalty`
- `return_eligibility`
- `trial_terms`

The tools are deterministic, read-only, source-backed, and fail closed to
`UNKNOWN` when required facts are unavailable. They do not modify subscriptions
or vendor accounts.

No API key or environment variable is required. See the live proof and complete
scope at https://www.decide.fyi/resources/policy-notaries.
