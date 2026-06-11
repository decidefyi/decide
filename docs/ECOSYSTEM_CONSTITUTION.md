# Decide + Krafthaus Ecosystem Constitution

Status: Active architecture direction
Effective: 2026-06-11

## Purpose

This document defines the product hierarchy and the boundaries that keep the
ecosystem coherent as new applications are added.

The system is not a collection of unrelated decision products. It is one
governed-action architecture expressed through multiple application surfaces.

## Product Hierarchy

### Signalnio

Signalnio is the company and architecture layer.

It owns:

- system architecture and product boundaries
- cross-product vocabulary and trust model
- application selection and commercial framing
- governance of the Decide and Krafthaus relationship

### Decide.fyi

Decide is the deterministic policy runtime and Decision Record infrastructure.

It owns:

- versioned rulebook evaluation
- normalized `yes`, `no`, or `review` decisions
- purpose-specific application verdicts and reason codes
- policy and rulebook hashes
- Decision Record creation
- idempotency, verification, replay, execution receipts, and outcomes
- bounded first-party policy adapters

Decide must not depend on a specific user interface or vertical application.

### Krafthaus

Krafthaus is the forward-deployed product and delivery layer that installs
Decide into one consequential workflow.

It owns:

- identifying the consequential action boundary
- authoring and configuring the purpose-specific rulebook
- workflow intake and evidence collection
- operator and human-review interfaces
- integrations with the systems before and after the boundary
- execution handoff and outcome presentation
- packaged and customer-specific application surfaces

Krafthaus does not mean arbitrary custom software. A Krafthaus application must
contain a governed action boundary that benefits from explicit rules and a
verifiable record before execution.

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

### Decide-native reference applications

- Policy MCP Notaries
- source-backed refund, cancel, return, and trial endpoints
- policy patterns and verification surfaces

These demonstrate the runtime directly and may be shown in the Krafthaus
application catalog without implying that all interface ownership is identical.

### Krafthaus applications

- Decision Memos
- Solana Execution Gate
- future customer workflow applications

`One KPI. One owner. One written call.` describes the Decision Memos
application. It does not define Krafthaus as a whole.

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
   The Refund, Trial, Cancel, and Return Policy MCP notaries now satisfy this
   condition with direct declarative Rulebook v1 evaluation and no trusted
   adapter.
4. Public copy distinguishes deterministic evaluation from AI assistance.
5. Replay tests prove that stored rulebooks and inputs reproduce the semantic
   result.
