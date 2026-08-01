# Decide Conformance Fixtures

These fixtures are a small public conformance pack for Decision Record v1 verification.

Use the valid fixture:

```sh
npx @decide-fyi/sdk verify fixtures/valid-decision-record.json \
  --input fixtures/decision-input.json \
  --hmac-secret decide_conformance_hmac_secret_v1 \
  --json
```

Use the tampered fixture:

```sh
npx @decide-fyi/sdk verify fixtures/tampered-record.json \
  --input fixtures/decision-input.json \
  --hmac-secret decide_conformance_hmac_secret_v1 \
  --json
```

Expected results:

- `valid-decision-record.json` verifies.
- `tampered-record.json` fails record, receipt, and signature checks.
- `replay-diff-example.json` shows the shape of a current-policy replay drift packet.

The HMAC secret above is intentionally public and only signs these conformance fixtures.
