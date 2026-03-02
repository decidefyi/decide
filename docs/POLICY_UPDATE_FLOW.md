# Policy Update Flow

This repository keeps policy hash/source artifacts up to date via `scripts/check-policies.js` and the `Daily Policy Check` workflow.

## Goal

Reduce commit noise on `main` while keeping refresh behavior deterministic.

## Current delivery mechanism

1. The scheduled workflow runs `node scripts/check-policies.js`.
2. Generated artifacts are committed to an aggregation branch: `policy-updates/aggregate`.
3. The workflow creates or updates a single open PR from `policy-updates/aggregate` to `main`.
4. Operators review and merge the PR when ready.

## Operator runbook

1. Open Actions → `Daily Policy Check`.
2. Confirm the run completed and a PR was created/updated.
3. Review PR diff:
   - `rules/*-hashes.json`
   - `rules/*-policy-sources.json`
   - `rules/*-coverage-state.json`
   - `rules/*-semantic-state.json`
   - `rules/policy-alert-feed.json`
4. Merge PR after validation.

## Emergency/manual flow

Run locally from repo root:

```bash
node scripts/check-policies.js
npm run test:policy-feed
npm run test:contract
```

Then commit artifacts to a branch and open a PR (do not push directly to `main`).
