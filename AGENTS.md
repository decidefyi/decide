# Codex Instructions (Decide)

This repo is the Decide API/MCP decision engine. It is not the Krafthaus
application repo and it is not the public marketing-site repo.

## Product Boundary

Decide is independent decision infrastructure for software and agents. It is
the Decision API, not a vendor-policy platform. The canonical product ownership
document is `docs/ECOSYSTEM_CONSTITUTION.md`; runtime schemas still govern wire
behavior and compatibility.
It owns:

- Rulebook v1 validation and evaluation.
- Trusted adapter fact normalization.
- Verdict, action, reason-code, and matched-rule output.
- Rulebook hashes, input hashes, attestations, replay, and verification.
- Stable REST/MCP compatibility surfaces for policy notaries and runtime users.

Krafthaus is the application and workflow layer built on Decide. Independent
applications can use Decide without Krafthaus. An app's APIs, MCP tools, agents,
provider credentials and execution code belong to the app; generic evaluation
and record interfaces belong to Decide. Do not make this repo depend on a
specific Krafthaus UI, customer workflow, or vertical application.

Policy Notaries and vendor monitoring are specialist reference/evidence
capabilities with preserved REST/MCP compatibility. They do not define the core
product. Do not move endpoints, rebrand directory identities, or rename wire
fields merely to align positioning.

The approved-binding prototype is not a production authorization service. A
caller-supplied rulebook proves what was evaluated, not owner approval. See
`docs/APPROVED_ACTION_PRODUCTION_PATH.md` before adding an agent-facing authority
profile. Keep experimental code out of production handlers until its gates pass.

`One KPI. One owner. One written call.` describes one Krafthaus application
surface. It must not be treated as the definition of Decide or of Krafthaus.

## Non-Negotiable Runtime Contract

The production core is:

```text
hybrid_declarative_rulebook_with_trusted_adapters
```

Binding production verdicts are valid only through:

- `direct_declarative_rulebook`
- `trusted_adapter_facts_then_declarative_rulebook`

In both modes, Rulebook v1 is the only binding verdict selector. Trusted
adapters may emit bounded facts, but they do not choose the binding outcome.

Legacy `single`, `multi`, and `runtime` modes are AI-assisted/advisory surfaces.
They must expose `decision_contract.authority: "advisory_only"` and
`decision_contract.production_verdict: false`. Never present those paths as the
production determinism boundary.

Customer executable rulebooks are not supported in Rulebook v1. Requests such as
`binding_mode: "customer_executable_rulebook"` must fail closed. Executable
customer policy logic requires a future versioned contract.

Rulebook requests must reject caller-supplied Decide output material, including
`runtime_binding`, `trusted_adapter`, `adapter_facts`, `rulebook_attestation`,
`rulebook_contract`, `input_hash`, `application_verdict`, `action`,
`reason_code`, and `matched_rule_id`, whether those fields appear at the request
root, inside `context.inputs`, or in trusted-adapter facts.

## Files That Must Stay Aligned

When changing runtime contracts, update and verify all affected surfaces:

- `api/decide.js`
- `lib/rulebook-v1.js`
- `lib/rulebook-runtime-contract.js`
- `lib/trusted-adapters*.js`
- `public/schemas/*.json`
- `public/manifests/rulebook-runtime-v1.json`
- `public/conformance/rulebook-v1/*`
- `public/replay/rulebook-v1/*`
- `docs/RULEBOOK_RUNTIME_ARCHITECTURE.md`
- `docs/RULEBOOK_V1.md`
- `docs/APPLICATION_BINDING_V1.md`
- `docs/TRUSTED_ADAPTERS_V1.md`
- `README.md`
- `scripts/test-decision-contract.js`
- `scripts/rulebook-runtime-production-smoke.js`

Do not hand-edit generated manifests, conformance indexes, or replay corpus
files when a generator exists. Run the generator and review the diff.

## Editing Rules

- Keep public response shapes backward-compatible unless the change is an
  explicit versioned contract migration.
- Preserve the advisory-vs-binding distinction in code, docs, examples, tests,
  homepage copy, and smoke checks.
- Do not hide validation failures by coercing malformed requests into successful
  direct rulebook evaluations.
- Do not add new ambient capabilities to trusted adapters without updating
  adapter audits, isolation checks, docs, and contract tests.
- Do not expose secrets from `.env*`, Vercel, Supabase, Resend, Gemini, Stripe,
  wallet, or registry configuration.
- Preserve user changes in dirty files. Never revert unrelated work.
- Use `rg` for search and `apply_patch` for manual edits.

## Verification

For code changes, run the narrowest useful checks first, then broaden if the
runtime contract moved.

Useful local checks:

```bash
node --check api/decide.js
node --check lib/rulebook-v1.js
node --check lib/rulebook-runtime-contract.js
node --check scripts/test-decision-contract.js
npm run test:contract
```

For Rulebook/runtime contract changes, also run:

```bash
npm run generate:rulebook-runtime-manifest
npm run generate:golden-replay
npm run rulebook:migration-dry-run -- --json
npm run smoke:rulebook-runtime
```

For MCP or policy-notary changes, include the relevant targeted checks:

```bash
npm run mcp:check
npm run smoke
npm run test:policy-check
npm run test:policy-feed
npm run test:policy-alerts-api
```

`npm run smoke:rulebook-runtime` hits the deployed API. Use it after production
routing or runtime-contract changes, or when explicitly verifying live behavior.

## Git And Deploy

Run git only inside this repo, never from `/Users/jag1/Documents/New project`.
Do not commit unless the user asks.

Before committing:

```bash
git status --short
git diff --check
```

If push fails with `pack-objects died of signal 10`, first try:

```bash
git -c core.commitGraph=false push origin main
```

Deploy only when the change affects served behavior or the user explicitly asks
for deployment. Documentation-only or agent-instruction changes usually do not
need a Vercel deploy.
