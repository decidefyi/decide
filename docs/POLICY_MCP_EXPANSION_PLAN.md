# Policy MCP Expansion Plan

## Objective

Turn the four-tool Policy Notaries suite into a credible proof and acquisition
surface for one paid, consequential support workflow without overstating raw
directory traffic as customer demand.

## Current position

- One canonical remote serves all four policy tools at
  `https://policy.decide.fyi/api/mcp`.
- Specialist endpoints remain compatibility surfaces, not separate acquisition
  products.
- The Official MCP Registry, Smithery canonical listing, Glama catalog, and
  the MCP.so review queue are the active distribution base. The
  awesome-mcp-servers correction remains a single pending curation path.
- The policy tracker has a strong governance boundary: it records source
  signals, while reviewed versioned rules alone change deterministic results.
- Production telemetry proves remote traffic and completed tool evaluations.
  It now records declared MCP client families and conservatively attributes
  same-caller, same-surface events when the client is unambiguous. The public
  Policy Notaries page separately records tagged source and referrer hostname.
  Neither path identifies customer identity, paid status, or installation
  conversion, so treat them as instrumentation rather than adoption proof.

## Executed in this pass

1. Recorded the MCP.so canonical-suite submission in the distribution ledger.
2. Hardened Zendesk reference routes with Bearer authentication, production
   fail-closed configuration, test-only fixture overrides, and an explicit
   `execution_allowed: false` contract.
3. Added an operator report that separates discovery, probes, completed policy
   evaluations, and invalid evaluations without exposing caller IPs or tool
   payloads.
4. Documented the production support-policy architecture and the boundary
   between Policy Notaries, Decision Records, Krafthaus workflow apps, and
   downstream executors.
5. Added declared MCP client attribution, conservative follow-on event
   inference, website source/referrer attribution, and a token-gated 30-day
   adoption snapshot in the existing operator metrics flow.
6. Separated authenticated first-party verification traffic from adoption
   metrics. Requests marked with the internal probe secret remain visible in a
   dedicated aggregate but cannot increase evaluator, tool, client, or caller
   totals.
7. Added a durable, privacy-minimal guide conversion ledger that separates
   guide views, connection intent, public REST proof results, and Krafthaus
   workflow handoffs from actual MCP evaluations. The Console reports those
   stages independently and labels salted network-group overlap as directional,
   never as person-level attribution.

## Next 30 days: prove one repeated workflow

### Product

Build one **Support Policy Gate** inside Krafthaus for a design partner:

```text
support ticket -> verified facts -> one Policy Notaries tool -> Rulebook v1
Decision Record -> approved downstream action or human review
```

Start with refund eligibility or cancellation penalty, not all four workflows
at once. Choose one company with recurring, costly exceptions and a support
system of record that can supply the required facts.

Success criteria:

- one live queue with a named owner;
- at least 25 real decisions across at least two weeks;
- every decision has a stored verdict, record handle, and outcome or review;
- no automated action after missing policy facts or a failed binding check.

### Distribution

- Monitor the existing primary listings and one awesome-list pull request.
- Do not open duplicate specialist listings or directory-spam the suite.
- Update registry or directory metadata only for material endpoint, tool-set,
  or positioning changes.
- Add source attribution outside the MCP server before claiming a directory
  produces installs: tagged website links, marketplace install metrics, or a
  short onboarding question are sufficient.

### Measurement

Load the token-gated operator Console weekly for the 30-day adoption snapshot,
or run the equivalent private CLI report in an environment with the server-side
Supabase credentials:

```bash
npm run report:mcp-adoption -- --days=30
```

Read it in this order:

1. Policy Notaries guide views and declared source mix;
2. connection intent and completed public REST proofs;
3. completed MCP evaluations by tool;
4. repeat known evaluators across multiple UTC days;
5. workflow handoffs, invalid evaluations, and review-required rate.

The Console and CLI expose aggregates only. They do not return raw caller
identifiers or request payloads. MCP client inference requires one unambiguous
declared client for the same privacy-preserving caller and endpoint surface;
shared or conflicting client evidence remains `other`.

Guide funnel retention is enabled separately with
`POLICY_FUNNEL_SUPABASE_ENABLED=1` and the service-only
`policy_funnel_events` table from `docs/sql/policy_funnel_supabase.sql`.
Connection clicks are intent, public proof results are REST activity, and
workflow handoffs are navigation events. None independently proves an install,
customer, sale, or successful production rollout.

Set `MCP_INTERNAL_PROBE_TOKEN` only in server-side environments and first-party
production checks. Those checks send `X-Decide-Internal-Probe`; the server
records only `traffic_class=internal_probe`, never the token. Missing,
unconfigured, or incorrect tokens remain `external_or_unknown` and cannot opt
third-party traffic out of adoption reporting.

Do not call initialization, tool-list traffic, an IP-derived caller count, or
a directory counter a customer.

## Days 31-60: package the paid wedge

Offer a narrowly scoped Krafthaus **Workflow App Sprint**:

- one support-policy boundary;
- one ticketing or CRM connection;
- one Rulebook v1 action boundary and Decision Record path;
- one human-review queue;
- one reusable evidence/outcome report.

Keep the public policy tools free as proof and interoperability surface. Price
the installed workflow, operational controls, and execution handoff rather than
trying to charge for a generic policy lookup before repeat workflow evidence
exists.

## Days 61-90: expand only after retained use

Expand from the first policy type only when the pilot has retained usage and
auditable outcomes. The next expansion may be another notary tool, another
support queue, or a partner-led deployment; choose based on observed demand.

Before creating a new customer-facing product or a new public listing, require:

- repeated use by the original workflow owner;
- a documented failure/review pattern worth automating;
- a clear buyer, owner, and downstream executor;
- evidence that the new surface is not merely a compatibility endpoint.

## Enterprise and security gates

- Do not expose the protected Decision Runtime as a public MCP server until it
  has an explicit OAuth/protected-resource design, scoped authorization, tenant
  isolation, audit retention, and a customer need for it.
- Do not make an LLM, policy crawler, or client-provided decision material the
  production verdict selector.
- Do not let source-tracker updates change rulebooks automatically.
- Keep the Zendesk routes as reference adapters until a customer integration
  implements real identity, authorization, idempotency, retention, and
  execution controls.

## Decision checkpoints

| Checkpoint | Evidence needed | Decision |
| --- | --- | --- |
| Discovery | canonical listings stay healthy and tools remain interoperable | Maintain canonical distribution only |
| Evaluation | repeated completed calls from identifiable integrations | Invest in onboarding and docs |
| Pilot | one workflow owner runs the gate on real cases | Package the Krafthaus sprint |
| Retention | two or more weeks of useful outcomes and review reduction | Expand within that buyer segment |
| Enterprise | a customer needs protected runtime/actions | Design OAuth and a separately scoped MCP surface |
