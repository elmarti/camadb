# Versioning and publishing

Publishable packages have independent versions. A change updates every affected manifest and changelog; internal dependency ranges are updated in the same pull request. Breaking changes to `camadb` or `@camadb/core` follow the compatibility policy in `migration-2.x.md`.

Run `yarn release:check` before tagging. CI repeats all validation and performs npm dry runs. The release workflow publishes in dependency order: `@camadb/core`, `@camadb/memory`, then `camadb`. npm trusted publishing or `NPM_TOKEN` supplies registry credentials. A failed downstream publish can be safely retried because already-published versions are detected by npm; versions must never be overwritten.

Release pull requests should state package names, old/new versions, compatibility impact, and migration notes. Prereleases use a semver prerelease suffix and npm dist-tag rather than changing dependency direction.
