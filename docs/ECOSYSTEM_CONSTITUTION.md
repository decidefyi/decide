# Decide + Krafthaus Ecosystem Constitution

Status: Active product architecture
Effective: 2026-09-23
Supersedes: the 2026-06-11 product hierarchy, not its runtime contracts

## Purpose

This is the canonical product-ownership document for `decide`, `decidesite`,
and `krafthaus`. Runtime schemas remain authoritative for wire behavior. This
document defines ownership and positioning, not deployment or release status.

Decide supplies reusable decision infrastructure. Krafthaus supplies complete
applications that use it. APIs, MCP tools, and agents stay with the product that
owns their capability. An interface is not a new product layer.

Independent applications can use Decide without adopting Krafthaus. Krafthaus
is a first-party consumer and proving ground, not a mandatory gateway.

## Product Hierarchy

### Signalnio

Signalnio is the company and architecture layer.

It owns:

- system architecture and product boundaries
- cross-product vocabulary and trust model
- application selection and commercial framing
- governance of the Decide and Krafthaus relationship

### Decide.fyi

Decide is independent decision infrastructure for software and agents.
Its product category is the Decision API. Its focus is decisions governing
consequential software actions, not arbitrary computation or vendor policies.

It owns:

- versioned rulebook evaluation
- normalized `yes`, `no`, or `review` decisions
- the generic contract for application verdicts and reason codes
- rulebook, input, and evidence lineage
- Decision Record creation
- evaluation idempotency, verification, and replay
- generic execution-receipt and outcome record contracts
- bounded trusted-adapter registration and fact-normalization contracts

Reusable approved-configuration, authority, expiry and exact-action claim
mechanisms also belong to Decide when implemented. These are target
responsibilities, not a claim that the approved-binding prototype is a
production service. See the [production path](APPROVED_ACTION_PRODUCTION_PATH.md).

Decide must not depend on a specific user interface, Krafthaus account, or
vertical application. A Decide developer console may own rulebook management,
API credentials and record inspection without becoming a Krafthaus app.

### Krafthaus

Krafthaus is the application and workflow layer built on Decide. It delivers
packaged and customer-specific applications around consequential work.

It owns:

- identifying the consequential action boundary
- authoring and configuring the purpose-specific rulebook
- workflow intake and evidence collection
- operator and human-review interfaces
- integrations with the systems before and after the boundary
- application credentials, trusted execution, recovery and reconciliation
- execution handoff, receipt collection and outcome presentation
- packaged and customer-specific application surfaces
- app-specific APIs, MCP tools and agents

Krafthaus does not mean arbitrary custom software. A Krafthaus application must
contain a governed action boundary that benefits from explicit rules and a
verifiable record before execution.

## Shared Application Anatomy

Every production Krafthaus application follows this shape:

```text
proposed action from a person, application or agent
  -> explicit facts with source and freshness requirements
  -> owner-approved, versioned rules
  -> Decide evaluation
  -> decision and Decision Record captured before execution
  -> trusted application checks the exact action and current authority
  -> application executes, blocks or routes to human review
  -> execution receipt and observed outcome linked to the decision
```

The interface, buyer, input schema, verdict vocabulary, and target system may
change. The governed-action structure does not.

This is the required architecture, not evidence that every listed demo already
executes a real provider mutation. `yes` permits the application to consider
execution under its contract. `no`, `review`, missing required evidence and
evaluation failures must not silently become execution permission.

The executor enforces the boundary server-side. Asking an agent to call Decide
first is not enforcement if it can bypass the check and mutate the destination.

## What Counts As An Application

A workflow is a valid Krafthaus application when:

1. A specific action or handoff is about to occur.
2. A wrong action can cost money, trust, time, access, or operational safety.
3. The action can be governed by explicit inputs, rules, and escalation states.
4. The resulting verdict should travel with the action.
5. Later review benefits from knowing which rulebook and evidence produced the
   result.

Examples include:

- pricing and discount exceptions
- refunds, cancellations, and eligibility checks
- AI-agent tool or payout authorization
- onboarding and implementation readiness gates
- routing and escalation decisions
- treasury or wallet execution gates
- regulated review handoffs

Pure content production, generic dashboards, and unrelated internal tools do
not become Krafthaus applications merely because software can be built for
them.

## Existing Surface Classification

| Surface | Product role and owner | Implementation and compatibility |
| --- | --- | --- |
| Rulebook v1 evaluator and trusted-adapter runtime | Decide core | `decide`; preserve the existing runtime schema and binding modes |
| Decision API, records, verification, replay, receipt and outcome APIs | Decide core | Engine in `decide`; record/API adapters in `decidesite`. A repository boundary is not a new product |
| Decide website, developer console, SDK and public catalog | Decide developer experience | `decidesite`; direct integration must not require Krafthaus |
| Decision Runtime MCP | Decide core interface | Authenticated private preview in `decidesite`, not the public Policy Notaries endpoint |
| Approved-binding prototype | Future Decide core capability | Local experiment only; no public API, production authority or execution guarantees |
| Quote Approval, AI Agent Action Gate, Onboarding Readiness and Support Policy Gate | Krafthaus applications | Intake, purpose-specific rules, UI, APIs, integrations and execution belong to the app |
| Decision Memos and Solana Execution Gate | Krafthaus application surfaces | Their readiness or gate decisions use Decide; advisory output and external execution remain separate |
| Policy Notaries, refund, cancellation, return and trial checks | Specialist reference application suite | Existing Decide-owned REST/MCP compatibility endpoints remain stable; these do not define the core API |
| Vendor monitoring, source catalog and applicability review | Specialist evidence operations | Existing implementation remains in `decide`; ownership of source truth is distinct from generic evaluator behavior |

The application registry describes conformance and engineering truth, not a
list of independently marketed products. A policy reference appearing in that
registry does not turn every policy API into a Krafthaus-hosted endpoint.
Keep current public reference-suite names and directory identities until an
explicit compatibility-preserving migration is justified. Do not automatically
rebrand or relocate legacy tools because the architecture became clearer.

`One KPI. One owner. One written call.` describes the Decision Memos
application. It does not define Krafthaus as a whole.

### Experimental or AI-assisted surfaces

The legacy generic `single`, `multi`, and `runtime` modes use an LLM to produce
or help produce an answer. They are not the production determinism boundary.
They may support exploration, evidence shaping, or migration, but must not be
presented as equivalent to a versioned rulebook evaluation.

## API, MCP, Agent and Hosting Ownership

The owner is determined by the capability, not its transport:

- Generic evaluate, get-record, verify and replay interfaces belong to Decide.
- An app's submit-quote, launch-onboarding or request-support-action interface
  belongs to the application, whether exposed as a UI, API, MCP tool or agent.
- Generic protocol adapters must preserve the same decision semantics. Do not
  build a second evaluator inside an MCP wrapper.
- An application agent may plan and gather evidence. It must not approve its
  own authority, invent trusted facts, or bypass the executor's checks.
- Customers can use their own app and agent frameworks. Krafthaus is optional.

Core interfaces stay under Decide origins. New Krafthaus application interfaces
stay under Krafthaus or the app's own domain. The existing
`https://policy.decide.fyi/api/mcp` and specialist refund/cancel/return/trial
remotes remain compatibility surfaces. Hosting, repository layout and product
ownership are separate decisions; this architecture requires no DNS migration,
new microservices, or automatic republication to directories.

Registered trusted adapters are a narrow Decide runtime facility. Provider
credentials, live business-system integrations and mutation code belong to the
application. Vendor-specific monitoring supplies evidence; Decide's generic
contract defines how consumed evidence is identified and validated.

## Determinism Contract

For a production rulebook evaluation, determinism means:

> The same canonical inputs, rulebook content, rulebook version, evaluator
> version, and any pinned adapter implementation produce the same semantic
> decision, application verdict, action, reason code, and matched rule.

Request IDs, timestamps, storage locations, signatures, and audit-chain
positions may differ without violating semantic determinism.

Determinism does not establish input truth, sound business judgement, or a
successful external action. A signature establishes integrity and signer
authenticity for covered material; it does not independently prove source facts.
Missing facts can produce `review` or `NEEDS_INPUT`; malformed or unsupported
requests can fail validation. None grants permission to execute.

Current time and external state must be explicit captured inputs where they
affect a decision. Replay reconstructs historical evaluation, not fresh
permission to act. Concurrent actions against a shared budget or resource need
authoritative reservations or provider preconditions. Deterministic evaluation
alone does not guarantee exactly-once execution or prevent oversubscription.

## AI Boundary

AI may:

- extract structured facts from documents or conversations
- propose a draft rulebook for human review
- summarize evidence
- explain a deterministic verdict
- identify missing information
- generate interface copy

AI must not:

- silently replace rulebook logic
- invent required facts
- produce the binding production verdict for a loosely defined workflow
- execute arbitrary customer code inside Decide
- convert uncertainty into approval merely to return an answer

Any AI-derived fact used by a production rulebook must become explicit,
inspectable input before evaluation.

## Rulebook Ownership

Krafthaus or an independent customer application authors and configures
purpose-specific rulebooks. The accountable owner approves the rules and the
sources of authority, separately from the agent requesting an action.

Decide:

- validates them
- evaluates them
- versions and hashes them
- records the result
- supports verification and replay

The existing developer API accepts a caller-supplied Rulebook v1. That proves
what was evaluated, not that a business owner approved those rules. The planned
approved-action interface references stored owner-approved configurations and
trusted facts instead of accepting a raw rulebook from an untrusted agent.
Keep the developer evaluation contract intact; introduce the stronger authority
profile separately and only after its production gates pass.

## Positioning and Release Truth

- Decide: the decision API for software and agents. Evaluate proposed actions
  against versioned rules and explicit facts; return a reproducible decision
  and a verifiable record.
- Krafthaus: workflow applications built on Decide. Own the customer job from
  intake and review through execution handoff and follow-through.
- Policy is a valid technical term and an application domain, not Decide's
  product category. Do not rename compatible `policy_id` fields to change a
  marketing label.
- Do not describe an AI-assisted workflow as deterministic AI. State which
  evaluation is deterministic and which outputs remain advisory.
- Internal conformance, passing local tests, deployment and customer adoption
  are separate evidence. Do not use one as proof of another.

The next implementation sequence and production acceptance requirements are
in [Approved-action production path](APPROVED_ACTION_PRODUCTION_PATH.md).
