# CamaDB 3 release audit

Release safety is enforced in CI for every public-package change.

## Runtime and package contracts

- Node.js 22, 24, and 26 run affected builds, types, lint, tests, behavioural journeys, and clean package consumers.
- A real Chrome job exercises the knowledge demo through native IndexedDB.
- Clean temporary consumers execute CommonJS and ESM imports, compile TypeScript, bundle for browsers, and run a filesystem persistence journey through the compatibility package as an Electron main process would.
- Every public package is packed before inspection. The archive must contain its README, package manifest, and JavaScript/type entry points, with no unreviewed files outside `dist`.
- Public packages declare Node.js 22 or newer, explicit CommonJS/ESM/type exports, public npm access, and npm provenance.

## Dependency policy

`yarn audit:production` queries the registry for runtime dependency advisories and
fails on high or critical findings. Development-tool findings are reviewed
separately because they do not ship in package archives, but a finding that can
affect generated output or CI credentials is still a release blocker.

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
