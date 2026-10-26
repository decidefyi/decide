# Cloudflare origin guard

## Completion contract and current state

The intended end state is that ordinary clients reach the Decide API and Policy
Notaries through their existing Cloudflare hostnames, while direct connections to
the Vercel deployment cannot reach application routes. API, metrics and hook
authentication remain separate. This change adds no service or paid feature.

This source candidate is prepared against production/main
`41237ff789810783de20d46ec3c81d1f072ebe9e` on 26 October 2026. It is not a live
mitigation until the reviewed source is deployed and the guard is activated.
No production configuration, DNS, credential, deployment, or firewall change is
part of local preparation. Commit, push, deployment and live configuration require
the owner's scoped release authorization under the workspace agreements.

Current provider inventory for the `decide` project lists `api.decide.fyi`,
`policy.decide.fyi`, and `decide-alpha.vercel.app`. Production was
`dpl_2R46Boq8VRwWA4KNekzW7aHi9GkV`. Refresh this inventory before activation.
The separate `app.decide.fyi` website and DNS-only mail/authentication records are
outside this gate. The Cloudflare shared-IP warning can remain visible because
this gate authenticates the origin connection; it does not conceal Vercel's
public anycast IP.

A second project, `decade` (`prj_gCwQfcFjhIfgxDy7sBxezbJeCrJn`), serves
`refund`, `cancel`, `return`, and `trial.decide.fyi`, plus
`decide-1.vercel.app` and `decade-vert.vercel.app`. Its current production
`dpl_DXunitj4dbXjjgNjicNrqhYvm6Mh` has the same source revision. At least
`cancel.decide.fyi` is currently DNS-only. These are real separate production
routes, not aliases attached to the first project. Protecting only `decide`
does not establish closure across this second copy of the API.

The deployed website source (`1cf3e82d4bc8e4096925e3a72142b9a53c959ecc`)
defaults both its API and policy-alert upstreams to `decide-1.vercel.app`.
The current production `DECIDE_BACKEND_ORIGIN` configuration selects
`api.decide.fyi`, so ordinary API forwarding already uses the canonical host.
No `POLICY_ALERTS_UPSTREAM_URL` override was listed. Its alert bridge therefore
still needs a canonical upstream override before requiring the guard on
`decade`. This is configuration/source evidence; verify the actual bridge after
release.

The proposed complete release scope is consequently broader than the two-host
patch: protect both API projects, proxy the four legacy notary records, and set
the website's production `POLICY_ALERTS_UPSTREAM_URL` to
`https://api.decide.fyi/api/policy-alerts` with a website redeployment. Use a
separate dedicated token/header rule and digest for each API project. The second
rule matches only the four legacy hostnames. Preserve their current CNAME
targets, TLS, tool identities and API authentication. Do not alter `app` or
mail/authentication DNS. This coordinated production scope needs explicit owner
approval before activation; none of it was performed during preparation.

## Boundary

`middleware.js` runs on all requests, before local-host shortcuts and MCP
forwarding. It uses Web Crypto, retaining the default Edge runtime and adding no
dependency. There are no path, method, hostname, health, or static-file exemptions.

- Unset `DECIDE_ORIGIN_GUARD`, or exactly `off`: existing behavior.
- Exactly `required`: validate the edge token on every request.
- Any other configured value, including an empty string: `503` with
  `ORIGIN_PROTECTION_UNAVAILABLE`.
- Required mode with an absent or malformed `DECIDE_ORIGIN_TOKEN_SHA256`: same
  `503`. Never fall back to an open origin after a configuration error.
- Missing, malformed, duplicate/combined, or incorrect `x-decide-origin-token`:
  generic `403 ORIGIN_ACCESS_DENIED`, with `Cache-Control: no-store`.
- Valid dedicated token: continue existing routing and endpoint authentication.

The raw token must be 32 cryptographically random bytes encoded as exactly 64
lowercase hexadecimal characters. The Vercel environment contains only the
lowercase SHA-256 hex digest of that 64-character string, not the raw token.
Do not reuse API keys, proxy tokens, hook tokens, metrics tokens or test fixtures.
Do not log or echo the token, return it to clients, put it in URLs, shell command
arguments or committed configuration, or add it to browser code.

This application-layer guard rejects direct requests before endpoint work, but
still runs middleware. It does not promise to eliminate all Vercel ingress or
middleware usage. Vercel's platform DDoS protections remain relevant.

## Coordinated activation

1. Review and authorize the exact source diff and release scope. Preserve unrelated
   working changes. Run `npm run test:policy-mcp` and the relevant existing gates.
2. The owner creates and enters a new dedicated token in Cloudflare's request-header
   Transform Rule. The rule must **Set static**, replacing any incoming value of
   `x-decide-origin-token`. Scope it to the two API project hostnames:

   ```text
   (http.host in {"api.decide.fyi" "policy.decide.fyi"})
   ```

   Do not inject it into every subdomain or unrelated origins. Never use an
   append operation. Cloudflare must overwrite a client's forged header. Confirm
   no later rule removes/replaces it. Do not alter auth, mail, or app DNS records.
3. Store the digest in the project's server-side
   `DECIDE_ORIGIN_TOKEN_SHA256`. A preview can use a separate disposable token and
   digest; production values must not be placed in preview source or shell argv.
   Keep mode explicitly `off` while preparing the production release.
4. Verify a preview with `required`: missing, wrong and duplicate headers deny;
   a correct token allows GET, POST and OPTIONS. Exercise the canonical MCP
   same-origin forwarding with its original body and auth headers. These local
   tests alone do not prove Vercel deployment routing.
5. After the header rule is active, deploy the reviewed source with production
   mode `required` and the correct digest. Environment changes require a new
   Vercel deployment. Confirm the exact deployment and source revision.
6. Verify ordinary requests through both Cloudflare hostnames: health, public
   schemas, limited metrics and read-only MCP initialization/tools-list. Existing
   credentials must still be required for private operations. Use no paid calls
   or real workflow actions for verification.
7. Verify TLS-preserving direct `--resolve` requests to both custom hostnames
   return `403`, including health and explicit MCP handlers. Check the production
   Vercel alias and current deployment hostname. Vercel deployment protection
   may reject some aliases earlier; no alias may reach application data directly.
   A forged CF-Ray, CF-Connecting-IP, Origin, Host or forwarded-host is insufficient.
8. Verify existing frontend/API bridge traffic remains healthy. Do not mark this
   fixed until normal routes succeed and every relevant direct route denies.

Supported legacy notary hostnames are served by the separate `decade` project.
Keep them working; activate their separate rule only as part of the approved
coordinated scope described above. Any new
hostname attached to this protected deployment must traverse the same trusted
header rule. Any direct upstream that currently uses a Vercel alias must move to
the existing canonical API hostname before activation, rather than gain an open
exception in this guard.

## Rollback and rotation

If activation breaks legitimate traffic, use the approved prior deployment or a
new deployment with mode `off`. This explicitly reopens direct origin access;
record that state and restore protection after correcting the header rule. Do not
remove endpoint authentication, restore data, or change unrelated services.

A token rotation must coordinate both providers: retain the old configuration for
rollback, then change the Cloudflare token and Vercel digest in a controlled
release window with normal-route verification. This candidate accepts one token;
changing only one side interrupts service. Do not delete the Cloudflare header
rule while the guard is required.

## References

- [Cloudflare origin protection](https://developers.cloudflare.com/fundamentals/security/protect-your-origin-server/)
- [Cloudflare request-header Transform Rules](https://developers.cloudflare.com/rules/transform/request-header-modification/)
- [Vercel reverse-proxy prerequisites](https://vercel.com/docs/security/reverse-proxy)
- [Vercel Routing Middleware](https://vercel.com/docs/routing-middleware)
