---
name: policy-support-check
description: Check supported US consumer subscription refund, cancellation, return, and trial policies with Policy Notaries, a Krafthaus app powered by Decide. Use for support-policy questions and integration tests, not for executing account changes.
---

# Policy Support Check

Use the `decide-policy-notaries` MCP server when a task asks whether supplied
facts satisfy a supported public subscription policy.

## Workflow

1. Choose exactly one matching tool:
   - `refund_eligibility` for refund windows and qualifying conditions.
   - `cancellation_penalty` for cancellation consequences and billing cadence.
   - `return_eligibility` for reversing a subscription purchase.
   - `trial_terms` for a confirmed live trial offer.
2. Supply only observed facts. Never invent a vendor, date, region, plan,
   qualifying condition, billing cadence, or live offer detail.
3. Treat `UNKNOWN` as a review route, not approval or denial.
4. Include the verdict, reason, policy source, policy version, and verification
   time in the answer.
5. Do not claim the tool refunded, cancelled, returned, enrolled, charged, or
   changed an account. These tools only evaluate policy facts.

The current scope is supported US consumer subscriptions on individual plans.
For company-specific policy, other regions, enterprise contracts, or unsupported
vendors, explain the scope limit and do not call a nearby tool as a substitute.
