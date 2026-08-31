# Versioning and publishing

Publishable packages have independent versions managed by Changesets. Each user-visible pull request includes a changeset selecting the affected packages and semver bump. Internal dependency ranges are updated automatically in the release pull request. Breaking changes to `camadb` or `@camadb/core` follow the compatibility policy in `migration-2.x.md`.

Run `yarn release:check` before merging. On every push to `main`, the release workflow validates the workspace. When unreleased changesets exist, it creates or updates a release pull request containing package versions and changelogs. Merging that pull request automatically publishes the changed packages and creates tags. npm trusted publishing or `NPM_TOKEN` supplies registry credentials.

## Develop alpha channel

Every push to `develop` publishes the packages affected by pending changesets as unique snapshot prereleases such as `0.3.0-alpha-<timestamp>` under npm's `alpha` dist-tag. The same workflow can be started manually from GitHub Actions while `develop` is selected. Snapshot versions are generated only in CI and are not committed or tagged, so they do not consume changesets or alter the stable release pull request on `main`.

Install an alpha explicitly with `npm install @camadb/core@alpha` or `npm install camadb@alpha`. Alpha publishing is serialized to prevent two runs from racing for a version.

Release pull requests should state package names, old/new versions, compatibility impact, and migration notes. Prereleases use a semver prerelease suffix and npm dist-tag rather than changing dependency direction.
