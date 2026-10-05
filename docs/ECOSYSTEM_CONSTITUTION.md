# Decide + Krafthaus Ecosystem Constitution

Status: Active architecture direction
Effective: 2026-06-11
Ownership clarification: 2026-10-05

## Purpose

This document defines the product hierarchy and the boundaries that keep the
ecosystem coherent as new applications are added.

The system has one general decision runtime, specialized standalone services,
and optional workflow applications. MCP, REST, and SDK are interfaces to these
products, not a separate product-ownership layer.

## Product Hierarchy

### Signalnio

Signalnio is the company and architecture layer.

It owns:

- system architecture and product boundaries
- cross-product vocabulary and trust model
- application selection and commercial framing
- governance of the Decide and Krafthaus relationship

### Decide Runtime

Decide is the general deterministic decision runtime and Decision Record
infrastructure. It is not a policy platform; policy checks are one use case.

It owns:

- versioned rulebook evaluation
- normalized `yes`, `no`, or `review` decisions
- evaluation of declared application verdicts and reason codes
- policy and rulebook hashes
- Decision Record creation
- idempotency, verification, replay, execution receipts, and outcomes
- bounded first-party trusted fact adapters

Decide must not depend on a specific user interface or vertical application.

### Decide Services

Decide Services are standalone specialized decision services built on the
runtime. Policy Notaries is the existing family: source-backed refund,
cancellation, return, and trial checks. This classification does not launch new
services or change the current runtime preview/access boundary.

Each service owns its domain inputs, approved rules, evidence sources, coverage,
freshness requirements, and domain-specific output contract. Its maintainers
own that package; the shared evaluator and record infrastructure stay in the
runtime. A service can expose MCP, REST, or SDK interfaces without a Krafthaus
workflow or UI being required.

Rulebooks can be authored by an authorized customer, a Decide service
maintainer, or a Krafthaus workflow owner. Decide evaluates the approved rules;
it does not invent their business authority.

### Krafthaus

Krafthaus is the workflow application and delivery layer built on Decide. It
installs the runtime, and optional Decide Services, into one consequential
workflow.

It owns:

- identifying the consequential action boundary
- configuring the workflow's approved rulebook and service bindings
- workflow intake and evidence collection
- operator and human-review interfaces
- integrations with the systems before and after the boundary
- execution handoff and outcome presentation
- packaged and customer-specific application surfaces
- application-specific APIs, MCPs, and agents that expose those workflows

Krafthaus does not mean arbitrary custom software. A Krafthaus application must
contain a governed action boundary that benefits from explicit rules and a
verifiable record before execution.

## Interface Ownership And Hosting

| Surface | Product owner | Canonical home |
| --- | --- | --- |
| General evaluation, records, verification, replay; generic Runtime API/MCP/SDK | Decide Runtime | Decide domains and runtime repository |
| Specialized standalone decision service and its MCP/REST/SDK | Decide Services | Decide service domains and service packages |
| Intake, review, execution, integrations; a workflow app's API/MCP/agent | Krafthaus | Krafthaus domains and application packages |

Ownership follows the capability, not the protocol or whether it has a visible
UI. A wrapper around a standalone decision check is a Decide service interface.
A tool that operates a support queue, quote workflow, or treasury handoff is a
Krafthaus application interface. Both may call the same runtime. Third-party
applications may integrate directly and need not adopt Krafthaus.

Keep the existing evaluator shared rather than copying it into each service.
Separate packages and contracts before considering separate repositories or
deployments. Existing compatibility URLs, registry identities, tool names,
schemas, and access controls remain stable. This clarification is not an
endpoint migration or a public Runtime MCP release.

## Shared Application Anatomy

Every production Krafthaus application follows this shape:

```text
workflow input
  -> optional trusted adapter facts
  -> purpose-specific rulebook
  -> Decide evaluation
  -> finite verdict and reason codes
  -> human or software action
  -> Decision Record
  -> execution receipt and outcome
```

The interface, buyer, input schema, verdict vocabulary, and target system may
change. The governed-action structure does not.

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

### Decide services and runtime references

- Decide Policy Notaries
- source-backed refund, cancel, return, and trial endpoints
- policy patterns and verification surfaces

Policy Notaries is a standalone Decide service, not a Krafthaus application.
Its MCP and REST surfaces remain Decide-owned. Service guides and directory
packages use **Decide Policy Notaries** (or **Policy Notaries**, publisher brand
**Decide**, where the marketplace separates those fields).

Krafthaus may show how its Support Policy Gate consumes that service, but the
workflow application and notary service are distinct products. The Krafthaus
page is a workflow guide, not the canonical owner or paid-access route for the
standalone notaries. Past submission receipts retain their historical branding;
editable submission packages follow this current ownership rule.

### Krafthaus applications

- Decision Memos
- Solana Execution Gate
- future customer workflow applications

`One KPI. One owner. One written call.` describes the Decision Memos
application. It does not define Krafthaus as a whole.

## Discovery And Adoption

Make the general runtime discoverable for developers with approved rules and
facts. Give each released service family a canonical, task-specific guide and
listing; preserve the existing notary acquisition paths. Give each Krafthaus
workflow a separate application page. Do not create a separate acquisition
product for every vendor or compatibility endpoint.

Discount approval is a maintained integration example, not evidence that it is
the winning market. Existing notary calls are usage evidence for that family,
not proof of paid demand for it or the general runtime. Measure discovery,
successful use, repeat external use, and paid demand separately. A service call,
underlying evaluation, and workflow action are distinct events, not three
independent customer acquisitions or automatically three billable units.

### Experimental or AI-assisted surfaces

The legacy generic `single`, `multi`, and `runtime` modes use an LLM to produce
or help produce an answer. They are not the production determinism boundary.
They may support exploration, evidence shaping, or migration, but must not be
presented as equivalent to a versioned rulebook evaluation.

## Determinism Contract

For a production rulebook evaluation, determinism means:

> The same canonical inputs, rulebook content, rulebook version, evaluator
> version, and any pinned adapter implementation produce the same semantic
> decision, application verdict, action, reason code, and matched rule.

Request IDs, timestamps, storage locations, signatures, and audit-chain
positions may differ without violating semantic determinism.

Determinism does not mean that every business problem has a forced answer.
Missing, invalid, ambiguous, or unsupported inputs must resolve to a bounded
`review` or `NEEDS_INPUT` result.

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

Krafthaus authors and configures purpose-specific rulebooks.

Decide:

- validates them
- evaluates them
- versions and hashes them
- records the result
- supports verification and replay

This boundary lets Krafthaus remain broad in application while Decide remains
narrow and serious as infrastructure.

## Public Repositioning Gate

Krafthaus should not be publicly repositioned as the broad application layer
until all of the following are true:

1. Rulebook evaluation is the production path for binding verdicts.
2. At least one existing Krafthaus application has migrated to an explicit
   rulebook. The Solana Execution Gate now satisfies this condition.
3. A second materially different application reuses the same runtime contract.
   The Decision Memo Readiness Gate now satisfies this condition with a
   trusted-adapter-backed readiness rulebook; the Refund, Trial, Cancel, and
   Return Policy MCP notaries also satisfy it with direct declarative Rulebook
   v1 evaluation and no trusted adapter.
4. Public copy distinguishes deterministic evaluation from AI assistance.
5. Replay tests prove that stored rulebooks and inputs reproduce the semantic
   result.
