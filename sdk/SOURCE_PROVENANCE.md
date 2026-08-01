# SDK source provenance

Beginning with `@decide-fyi/sdk@0.1.18`, this `sdk/` directory in the public
`decidefyi/decide` repository is the canonical source for published SDK
releases.

The current package release is `@decide-fyi/sdk@0.1.19`.

Release requirements:

1. The package version, changelog, public source, and website SDK metadata must
   agree.
2. `npm pack --dry-run --json` must include the SDK implementation, type
   declarations, fixtures, examples, `README.md`, `CHANGELOG.md`, this file,
   and `LICENSE`.
3. Package tests and Decision API contract tests must pass before publication.
4. The source commit must be pushed before the package is published.
5. npm provenance is claimed only when the registry reports verified
   provenance for that release.

The package is licensed under Apache-2.0. Product trademarks and hosted-service
access are not granted by that software license.
