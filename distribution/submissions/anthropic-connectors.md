# Anthropic Connectors Directory submission packet

Ownership copy reviewed: 2026-10-05. This is an editable submission candidate,
not evidence that an external listing has been updated. Recheck current portal
eligibility before submission; preserve prior receipts separately.

## Listing

- Server name: Policy Notaries
- Tagline: Source-backed subscription policy checks
- Slug: `decide-policy-notaries`
- Description: Policy Notaries is a standalone Decide service. It gives
  Claude four deterministic, read-only checks for supported US consumer
  subscription vendors: refund eligibility, cancellation penalties, returns,
  and trial terms. Each answer includes a source URL and verification metadata.
  Missing or approval-dependent facts fail closed to `UNKNOWN` so the workflow
  can route to human review.
- Categories: Business, Productivity
- Documentation: `https://www.decide.fyi/resources/policy-notaries`
- Technical documentation: `https://www.decide.fyi/resources/policy-notaries`
- Privacy policy: `https://www.decide.fyi/privacy`
- Support contact: `support@decide.fyi`
- Publisher brand: Decide (use the provider-verified legal business identity)
- Company website: `https://www.decide.fyi`
- Icon: `https://policy.decide.fyi/favicon.svg`

## Connection

- URL: `https://policy.decide.fyi/api/mcp`
- Transport: Streamable HTTP
- URL scope: The same URL is used by every user.
- Authentication: None
- Accounts or paid plans required before connection: None
- API ownership: First-party Decide API using versioned public policy sources.
- Personal health data: No
- Sponsored content: No
- Read/write classification: Read-only policy evaluation; no external action.
- Allowed link URIs: None. The server does not use the `ui/open-link` capability.

## Primary use cases

1. Determine whether supplied purchase facts support refund eligibility.
2. Identify whether cancelling a supported subscription is free, penalized,
   locked, or requires review.
3. Determine whether supplied purchase facts support a subscription return.
4. Evaluate a confirmed live trial offer's duration, card requirement, and
   auto-conversion behavior.
5. Route incomplete or approval-dependent cases to review rather than inventing
   a policy approval.

## Reviewer test prompts

1. `Can an individual US Adobe customer get a refund 12 days after purchase if the qualifying conditions are confirmed?`
2. `What cancellation penalty applies to an individual US Adobe annual subscription?`
3. `Is an individual US Adobe subscription returnable five days after purchase when its qualifying conditions are met?`
4. `Adobe shows this individual US account a 7-day trial that requires a card and auto-converts. What are the trial terms?`
5. `Can an individual US Dropbox customer get a refund 10 days after purchase? I do not know whether special qualifying conditions were met.`

Expected behavior: each in-scope prompt invokes only the matching tool and
returns source-backed policy metadata. The fifth prompt must fail closed or ask
for missing context; it must not invent approval.

## Portal gate

Remote connector submissions require a Claude Team or Enterprise organization
and directory-management access. Once that account gate is satisfied, use the
Claude.ai admin submission portal and paste this packet into the saved draft.
