# OpenAI plugin submission packet

Ownership copy reviewed: 2026-10-05. This is an editable submission candidate,
not evidence that an external listing has been updated. Verify current portal
requirements and the existing submission status before any authorized refresh.

## App

- Display name: Policy Notaries
- Publisher brand: Decide
- Runtime: Powered by Decide
- Public attribution: Decide Policy Notaries
- Subtitle: Check support policies
- Category: Business
- MCP server URL: `https://policy.decide.fyi/api/mcp`
- Transport: Streamable HTTP
- Authentication: None
- Product guide: `https://www.decide.fyi/resources/policy-notaries`
- Technical guide: `https://www.decide.fyi/resources/policy-notaries`
- Privacy policy: `https://www.decide.fyi/privacy`
- Terms: `https://www.decide.fyi/terms`
- Support: `support@decide.fyi`
- Company website: `https://www.decide.fyi`
- Logo: `https://policy.decide.fyi/favicon.svg`

## Brand hierarchy

- `Policy Notaries` is the short marketplace display name; `Decide Policy
  Notaries` is the canonical standalone service name.
- `Decide` is the publisher brand and owns the service, not only its runtime.
- `Krafthaus` owns optional workflow applications consuming that service; a
  Krafthaus account or workflow is not required for these public tools.
- Stable MCP and REST URLs and tool contracts remain unchanged.
- Use the verified legal business identity responsible for Decide. Publisher
  branding is not proof of legal verification; do not replace the legal entity
  or publish under an individual identity based on this copy change.

## Review statement

Policy Notaries is a standalone Decide service built on the Decide runtime. It
exposes four deterministic policy checks for supported US consumer subscription
vendors. The tools evaluate user-supplied facts against versioned source
snapshots and return a verdict, reason, source URL, policy version, verification
timestamp, source hash, and Rulebook evidence. They do not refund, cancel,
return, enroll, charge, message, publish, or otherwise change a customer or
vendor system. Missing or approval-dependent facts return `UNKNOWN` and must
route to review.

The server has no MCP App UI resources. It returns text and structured content,
does not request credentials or sensitive identifiers, and does not require a
test account. Tool input and output schemas, titles, descriptions, and all hint
annotations are advertised by the live endpoint.

## Submission flow

1. Complete business verification for the legal entity responsible for Decide in
   the OpenAI Platform organization. Do not use individual verification for the
   public listing.
2. Confirm the submitting project uses global rather than EU data residency.
3. Confirm the account has `api.apps.write` and `api.apps.read` permissions.
4. Connect the public MCP server in Developer Mode and run all eight review prompts.
5. Create an app-containing plugin draft in the plugin submission portal.
6. Select **Scan Tools**, verify all four tools and their schemas, then import
   `chatgpt-app-submission.json` from the repository root.
7. Submit the plugin for review. Do not upload screenshots because this server
   does not expose a UI resource.

## Source-controlled review data

The exact app copy, hint justifications, five positive tests, and three negative
tests live in `chatgpt-app-submission.json`.
