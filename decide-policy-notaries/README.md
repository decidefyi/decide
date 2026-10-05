# Policy Notaries for Cursor

Policy Notaries is a standalone Decide service. This plugin connects
Cursor to the public Decide Policy Notaries MCP server and adds guidance for
safe support-policy checks.

## Install

Install `decide-policy-notaries` from the Cursor Marketplace. The plugin uses
the hosted Streamable HTTP endpoint at
`https://policy.decide.fyi/api/mcp`; no local runtime, API key, or environment
variable is required.

## Included tools

- `refund_eligibility`
- `cancellation_penalty`
- `return_eligibility`
- `trial_terms`

The tools are deterministic, read-only, source-backed, and fail closed to
`UNKNOWN` when required facts are unavailable. They do not modify subscriptions
or vendor accounts.

## Included skill

`policy-support-check` routes a support question to the matching notary, keeps
unsupported facts out of the request, and treats `UNKNOWN` as a manual-review
outcome.

See the canonical service guide at
https://www.decide.fyi/resources/policy-notaries. Krafthaus offers an optional
support workflow built on Decide at
https://www.krafthaus.app/workflow-apps/support-policy-gate; it is not required
to call the standalone notaries.
