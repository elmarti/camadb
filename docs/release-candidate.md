# CamaDB 3 release-candidate process

CamaDB 3 release candidates are exact, committed package versions. The first
candidate is:

| Package          |      Version |
| ---------------- | -----------: |
| `camadb`         | `3.0.0-rc.0` |
| `@camadb/core`   | `3.0.0-rc.0` |
| `@camadb/memory` | `0.2.0-rc.0` |
| `@camadb/sync`   | `0.2.0-rc.0` |

The repository is in Changesets prerelease mode with the `rc` tag. Alpha
snapshots stop once this mode begins.

## Publish

1. Select `develop` in GitHub Actions.
2. Manually run **Release candidate**.
3. The workflow verifies committed prerelease state, runs `yarn release:check`,
   publishes the exact manifest versions under npm's `rc` dist-tag, and then
   installs those exact registry versions into clean CommonJS, ESM, TypeScript,
   browser-bundle and Electron-style consumers.
4. Confirm the npm package pages show provenance and that `latest` still points
   to the stable v2 release.

The workflow is deliberately manual: merging a pull request must not silently
publish a release candidate. Re-running an already published version is
expected to fail. Publish a new candidate instead of deleting or overwriting an
existing npm release.

## Validate from another project

Pin exact versions so a later candidate cannot change the result underneath the
test project:

```sh
npm install @camadb/core@3.0.0-rc.0
npm install @camadb/memory@0.2.0-rc.0
npm install @camadb/sync@0.2.0-rc.0
```

Test realistic payloads, restart behavior, filesystem or browser persistence,
failure recovery, packaging and performance. Report the exact package versions,
runtime, adapter and reproduction when a candidate fails.

## Advance or promote

A release-blocking fix receives a Changeset. Running `yarn version-packages`
while prerelease mode is active advances affected packages to the next reviewed
`rc.N`; publish it with the same workflow and repeat the relevant validation.

After the agreed soak has no blockers, run `yarn changeset pre exit` on a
reviewed release-promotion branch. Do not run `yarn version-packages` there:
merge the exited prerelease state from `develop` into `main`, then let the main
workflow create the final stable Changesets release pull request. Verify its
versions and changelogs; publication occurs only after that separate PR is
merged.
