# Typeform cancellation candidate

Status: runnable local research preview. Not production coverage, an MCP tool,
an authenticated account integration or a cancellation executor.

The real REST/MCP integration is now implemented separately. See
[Typeform cancellation integration](TYPEFORM_CANCELLATION.md) for its simpler
policy-only contract, scoped admission and runtime evidence boundary. The
account-shaped research preview below is not called by the real notary.

## Run it

From the Decide repository:

```sh
npm run preview:typeform-cancellation -- --example
npm run test:typeform-cancellation
```

The example is synthetic and uses its explicitly recorded evaluation time.
It is repeatable test material, not a current account check. To evaluate a
locally supplied JSON request using the current clock:

```sh
node scripts/preview-typeform-cancellation.js < /absolute/path/request.json
```

Stdin is limited to 16 KiB. A policy review result exits successfully and must
be inspected by the caller. Invalid JSON, excessive input or usage errors exit
with code 2. The command does not load credentials or make network requests.

## Chosen first scope

Only direct, self-serve **Typeform Basic** subscriptions in the US, with an
active prepaid monthly or annual term, are included. The request must identify
the organization, assert an owner/admin role and provide the actual paid-term
expiry. Plus, Business, Growth, Enterprise, custom/legacy agreements, third-party
billing, add-ons, respondent purchases, trials and free accounts require review.

These exclusions are a conservative product decision, not claims about which
other Typeform plans can be cancelled. No individual-plan alias is inferred for
an organization subscription.

Typeform describes a multi-step cancellation flow. Completing only part of it
does not establish success. [Cancellation instructions](https://help.typeform.com/hc/en-us/articles/360060804271-Cancel-your-Typeform-plan)

The policy preview describes an effective time at the prepaid term's actual
expiry. It does not calculate that date from billing cadence or evaluate refund
entitlement. [Paid-account changes](https://help.typeform.com/hc/en-us/articles/360038887692-What-happens-if-I-cancel-my-paid-account)

Organization settings require owner/admin access. In this preview those role
and account facts are supplied locally, not authenticated or fetched from the
customer's account. [Organization settings](https://help.typeform.com/hc/en-us/articles/360029663851-Organization-account-and-profile-settings)

## Decision and evidence boundaries

- The existing Rulebook v1 evaluator selects the candidate outcome. The wrapper
  validates facts and formats the preview; it does not independently select a
  binding verdict.
- A matching request yields `CANCEL_AT_PERIOD_END` and its supplied expiry.
  Unsupported, missing, malformed or stale facts yield `review` and no expiry.
- Every output is `authority: advisory_only`, `production_verdict: false` and
  `automation_safe: false`, including positive previews.
- `cancellation_confirmed` and `execution_performed` are always false.
  A later application must complete the provider flow and verify its result.
- `refund_eligibility: not_evaluated` is never a denial of refund rights.
- Request fingerprints include every supplied field, including organization
  identity. The decision fingerprint also includes the research bundle and
  evaluation time. Hashes provide reproducibility, not account authentication.
- No production attestation, replay/verify URL or Decision Record handoff is
  exported by this preview. The separately implemented notary supports those
  contracts and uses independent runtime evidence.

The [research bundle](reviews/typeform-cancellation-candidate-20260906.json)
records three official article checks with timestamps and body hashes. It is
explicitly automated research with delegated scope selection, not human policy
approval. A substituted bundle is rejected. Preview freshness expires 72 hours
after the earliest source check; it does not claim continuous source monitoring.

Account observations must be less than 15 minutes old and not future-dated.
Expiry must be a real, unambiguous UTC timestamp later than evaluation time.
The initial preview also caps the remaining term at 32 days for monthly billing
or 367 days for annual billing. These time bounds are our conservative preview
guardrails, not Typeform policy clauses. Expired input must be refreshed, not
silently normalized or backdated.

## Contract files

- Input: `rules/candidates/typeform-cancellation-request-v1.schema.json`.
- Output: `rules/candidates/typeform-cancellation-preview-v1.schema.json`.
- Declarative rules: `rules/candidates/typeform-cancellation-v1.json`.
- Implementation: `lib/candidates/typeform-cancellation.js`.

Schemas are local candidate artifacts and are not published under `/public`.
The candidate Rulebook JSON is research material, not an approved production
notary. Uploading a copy through the generic direct-rulebook API would only
evaluate the submitted rules and facts; it would not establish reviewed vendor
evidence or authenticated account authority.

## Separation from the real integration

Policy-specific admission, public scope fields and exact cross-repository
binding now exist in the real integration. Its policy-only result does not
require an account adapter. Actual execution still belongs in the application,
with account identity, operator authority, consent and provider confirmation.
Neither a preview result nor an API policy verdict is a cancellation receipt.
Publication and fresh runtime evidence must be verified for a release.
