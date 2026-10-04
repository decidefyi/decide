# Actions cost controls

These changes reduce unnecessary verification without replacing application tests or treating uptime as functional proof.

## Local first

Use the same source tree and Node major as CI. Use already installed, lockfile-matching dependencies.

- `npm run ci:preflight:quick`: whitespace and dependency-free CI policy tests.
- `npm run ci:preflight`: the full offline verification entry point. It does not install dependencies, push, deploy or call production smoke endpoints.

The quick command is not the complete release gate. Full verification also requires the repo's existing tools, browsers and any disposable PostgreSQL fixture. Missing prerequisites or failing checks are blockers, not reasons to skip tests into a pass. Batch related changes and verify the final tree before one authorized push. Local success cannot guarantee hosted success or replace required exact-SHA CI.

## What remains enabled

Manual checks select full verification. Runtime, dependency, workflow, mixed, unknown, malformed and unavailable diff evidence select full verification. Existing production and authenticated monitoring schedules are unchanged.

## Measure, do not promise

Do not claim a 90% account-wide saving from these rules. Compare complete job attempts before and after activation, round each job according to GitHub's billing rules, separate failures/cancellations, and check the account's billing page. Local tests consume no GitHub Actions runner minutes.

## Decide

Draft contract and inventory PRs allocate no jobs. Ready-for-review transitions resume checks. Obsolete runs cancel by workflow/ref; jobs have bounded timeouts and npm cache reuse. All contract, policy evidence, schema, MCP, SDK, isolated PostgreSQL and workflow tests remain selected.

The full preflight reproduces the contract workflow command set and inventory gate. Supply PostgreSQL binaries through your existing local PATH (for example the directory reported by `pg_config --bindir`). Inventory freshness remains a separate named hosted check. No deployment or scheduled policy check is disabled.
