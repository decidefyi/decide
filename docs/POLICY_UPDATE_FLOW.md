# Policy Update Flow

This repository keeps policy hash/source artifacts up to date via `scripts/check-policies.js` and the `Daily Policy Check` workflow.

## Goal

Reduce commit noise on `main` while keeping refresh behavior deterministic.

## Current delivery mechanism

1. The scheduled workflow runs `node scripts/check-policies.js`.
2. Every run uploads an immutable `policy-review-<run_id>` evidence packet containing the alert feeds, event ledger, status report, and weekly triage report.
3. When the checker succeeds, generated artifacts are copied onto `policy-updates/aggregate`, rebuilt from the current `main` with a lease-protected push.
4. The workflow creates or updates one conflict-free review PR from `policy-updates/aggregate` to `main`.
5. Operators review source URLs and semantic summaries, then merge the PR only when the monitoring baseline is acceptable.

The tracker never promotes monitored page text into a deterministic notary verdict. Notary rules remain curated, versioned contracts. A checker process crash preserves its evidence packet and then fails the workflow instead of reporting healthy status.

## Operator runbook

1. Open Actions → `Daily Policy Check`.
2. Confirm the checker process status is `0` and inspect the downloadable `policy-review-<run_id>` artifact.
3. Open the generated review PR and review its diff:
   - `rules/*-hashes.json`
   - `rules/*-policy-sources.json`
   - `rules/*-coverage-state.json`
   - `rules/*-semantic-state.json`
   - `rules/*-policy-daily-fingerprints.json`
   - `rules/*-policy-blocked-retry-queue.json`
   - `rules/policy-alert-feed.json`
   - `rules/policy-alert-review-feed.json`
4. Follow each changed alert's `source_url` and verify the semantic summary against the vendor page.
5. Merge the PR after validation. This accepts the monitoring baseline; it does not change a notary decision rule.

## Emergency/manual flow

Run locally from repo root:

```bash
node scripts/check-policies.js
npm run test:policy-feed
npm run test:contract
```

Then commit artifacts to a branch and open a PR (do not push directly to `main`).
