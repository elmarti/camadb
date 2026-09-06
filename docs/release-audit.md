# CamaDB 3 release audit

Release safety is enforced in CI for every public-package change.

## Runtime and package contracts

- Node.js 22, 24, and 26 run affected builds, types, lint, tests, behavioural journeys, and clean package consumers.
- A real Chrome job exercises the knowledge demo through native IndexedDB.
- Clean temporary consumers execute CommonJS and ESM imports, compile TypeScript, bundle for browsers, and run a filesystem persistence journey through the compatibility package as an Electron main process would.
- Every public package is packed before inspection. The archive must contain its README, package manifest, and JavaScript/type entry points, with no unreviewed files outside `dist`.
- Public packages declare Node.js 22 or newer, explicit CommonJS/ESM/type exports, public npm access, and npm provenance.

## Dependency policy

`yarn audit:dependencies` queries the registry twice. It fails on high or
critical findings in the published runtime graph. It also reviews the complete
build/test graph against [`security/tooling-audit-allowlist.json`](../security/tooling-audit-allowlist.json),
so a new high or critical toolchain advisory fails CI instead of disappearing in
aggregate counts.

The 6 September 2026 review found no production dependency vulnerabilities. It
found 20 unique toolchain advisories: 13 high, 6 moderate, 1 low, and no
critical advisories. The high advisories are transitive through Jest 29 and
ESLint 8, are absent from published archives, and primarily require an attacker
to control glob or YAML input passed to the developer tools. Pull-request CI is
read-only and receives no publishing credential. Replacing the lint/test stack
during release stabilization carries more regression risk than this isolated
tooling exposure, so the 13 high findings are explicitly accepted until 1
December 2026. The machine-readable acceptance expires and must be removed or
renewed after a fresh review.

Dependency update pull requests created against an obsolete branch are not
release evidence. Recreate relevant updates against `develop`, validate them
through the current workspace graph, and either merge them or record why the
installed version is accepted.

## Publishing controls

Stable publishing runs only from `main`, installs the frozen lockfile, targets
the npm registry, and receives GitHub's OIDC identity-token permission. Package
manifests request provenance so consumers can verify where published archives
were built. Registry credentials and trusted-publisher configuration are still
verified during the release-candidate rehearsal; static CI cannot prove an
external account is configured correctly.

Run the complete local audit with:

```sh
yarn release:check
```

The real Chrome journey is separate because it requires Chrome:

```sh
yarn workspace @camadb/knowledge-demo build
yarn test:browser
```
