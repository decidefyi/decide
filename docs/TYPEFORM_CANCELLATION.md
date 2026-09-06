# Typeform cancellation integration

Typeform cancellation is implemented in the existing cancellation REST and MCP
paths. It is not a separate MCP or a new application. Deployment status is
separate from the source admission recorded here.

## Request

Use `POST /api/v1/cancel/penalty`, or `cancellation_penalty` on either the
specialist cancellation MCP or the consolidated Policy Notaries MCP:

```json
{
  "vendor": "typeform",
  "region": "US",
  "plan": "basic",
  "billing_cadence": "monthly",
  "product": "platform_subscription",
  "purchase_channel": "direct",
  "contract_type": "self_serve",
  "requested_action": "cancel_at_period_end"
}
```

`billing_cadence` also accepts `annual`. Every field above is required for this
scope. The same request works through the DecideSite proxy with
`?decision_record=1`. The four new scope fields are optional for existing
vendors and are included in the exact-request binding across all three repos.

The positive result is `CANCEL_AT_PERIOD_END`, action
`schedule_cancellation_at_period_end`, reason `PAID_TERM_END_CANCELLATION`.
It includes `cancellation_effective: paid_term_end`, `execution_performed: false`,
`cancellation_confirmed: false` and `refund: not_evaluated`.

Missing or unsupported scope returns `UNKNOWN`, as does missing, expired,
changed or mismatched runtime evidence. Do not collapse the new outcome into
immediate cancellation. Existing vendors retain their previous outcomes.

## Evidence and authority

The [official cancellation guide](https://help.typeform.com/hc/en-us/articles/360060804271-Cancel-your-Typeform-plan)
requires completion of the provider flow and makes cancellation effective at
the paid term end. The [billing explanation](https://help.typeform.com/hc/en-us/articles/360038887692-What-happens-if-I-cancel-my-paid-account)
confirms monthly and annual timing. Exact account expiry is not inferred here.

`automation_safe: true` means the policy verdict is supported for the supplied
scope by current reviewed evidence. It is not authenticated account permission,
execution consent, a cancellation receipt or a refund decision. Krafthaus owns
operator authority, account identity and any later action. Its policy client
retains the period-end action and rejects a result for any different request.

The [admission record](reviews/typeform-cancellation-admission-20260907.json)
identifies Codex's source review under the user's explicit delegation. It does
not invent human sign-off. Refund, return and trial remain candidate surfaces.
Coverage counts distinct vendors instead of double-counting partial admissions.
The recorded cancellation burn-in passed 101 of 101 observations with stable
content. The admitted monitor uses the same structured help-center API first,
with the official article as fallback. This historical admission evidence does
not replace current runtime freshness checks.

The existing production source monitor now owns the cancellation source. The
service-only runtime snapshot must match the new cancellation catalog and
contain all 401 configured policy surfaces. Checked-in research is never a
runtime fallback. A release must refresh that monitored artifact and verify
both the positive case and fail-closed cases against the released code.

## Verification

`npm run test:typeform-cancellation` exercises both real MCP handlers, REST
decision material, supported and excluded scopes, evidence failure and scoped
admission. DecideSite and Krafthaus carry matching binding regressions.
The separate [local research preview](TYPEFORM_CANCELLATION_CANDIDATE.md) remains
advisory and is not used by the production notary.
