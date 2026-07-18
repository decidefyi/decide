# OpenAI plugin submission packet

## App

- Display name: Decide Policy Notaries
- Subtitle: Check support policies
- Category: Business
- MCP server URL: `https://policy.decide.fyi/api/mcp`
- Transport: Streamable HTTP
- Authentication: None
- Product guide: `https://www.decide.fyi/resources/policy-notaries`
- Privacy policy: `https://www.decide.fyi/privacy`
- Terms: `https://www.decide.fyi/terms`
- Support: `support@decide.fyi`
- Company website: `https://www.decide.fyi`
- Logo: `https://www.decide.fyi/assets/favicon-dark-blob-48.png?v=20260216n`

## Review statement

Decide Policy Notaries exposes four deterministic policy checks for supported US
consumer subscription vendors. The tools evaluate user-supplied facts against
versioned source snapshots and return a verdict, reason, source URL, policy
version, verification timestamp, source hash, and Rulebook evidence. They do not
refund, cancel, return, enroll, charge, message, publish, or otherwise change a
customer or vendor system. Missing or approval-dependent facts return `UNKNOWN`
and must route to review.

The server has no MCP App UI resources. It returns text and structured content,
does not request credentials or sensitive identifiers, and does not require a
test account. Tool input and output schemas, titles, descriptions, and all hint
annotations are advertised by the live endpoint.

## Submission flow

1. Complete individual or business verification in the OpenAI Platform organization.
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
