# Versioning and publishing

Publishable packages have independent versions managed by Changesets. Each user-visible pull request includes a changeset selecting the affected packages and semver bump. Internal dependency ranges are updated automatically in the release pull request. Breaking changes to `camadb` or `@camadb/core` follow the compatibility policy in `migration-2.x.md`.

Run `yarn release:check` before merging. On every push to `main`, the release workflow validates the workspace. When unreleased changesets exist, it creates or updates a release pull request containing package versions and changelogs. Merging that pull request automatically publishes the changed packages and creates tags. npm trusted publishing or `NPM_TOKEN` supplies registry credentials.

## Develop alpha channel

Before committed RC mode begins, every push to `develop` publishes the packages affected by pending changesets as unique snapshot prereleases such as `0.3.0-alpha-<timestamp>` under npm's `alpha` dist-tag. The same workflow can be started manually from GitHub Actions while `develop` is selected. Snapshot versions are generated only in CI and are not committed or tagged, so they do not consume changesets or alter the stable release pull request on `main`.

Install an alpha explicitly with `npm install @camadb/core@alpha` or `npm install camadb@alpha`. Alpha publishing is serialized to prevent two runs from racing for a version.

Alpha snapshots stop when the repository enters committed Changesets prerelease mode. During release-candidate validation, package manifests carry exact `rc.N` versions and the manually dispatched **Release candidate** workflow publishes them under npm's `rc` tag. The workflow runs the complete release gate and smoke-tests the exact registry packages after publication. See the [release-candidate process](./release-candidate.md).

Do not use the `rc` tag as a reproducible test dependency: pin the exact candidate version. Neither alpha nor RC publication moves npm's `latest` tag.

Stable promotion commits `changeset pre exit` on a reviewed branch before `develop` is merged into `main`; it does not run `version-packages` manually. The main workflow then runs the complete release gate and creates the normal Changesets PR containing stable versions and changelogs. Merging that second PR publishes stable versions and moves `latest`.

Release pull requests should state package names, old/new versions, compatibility impact, and migration notes. Prereleases use a semver prerelease suffix and npm dist-tag rather than changing dependency direction.
