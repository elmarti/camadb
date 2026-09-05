# Cama Studio

Cama Studio is a local, cross-browser DevTools extension for inspecting CamaDB
databases in the origin of the currently inspected page. Discovery, collection
health, bounded record pages, and queries are read-only. Record replacement and
deletion are explicit actions that preserve the version-3 generation and
tombstone contract.

## Develop

Build the workspace once, then start the extension runner for Chromium or
Firefox:

```sh
yarn workspace @camadb/studio dev
yarn workspace @camadb/studio dev:firefox
```

Open a page that uses CamaDB, open Developer Tools, and select the **CamaDB**
panel. Production artifacts are generated for Chromium, Firefox, and Safari:

```sh
yarn workspace @camadb/studio build
```

They are written beneath `apps/studio/.output/`. Safari's generated WebExtension
still needs to be packaged and signed using Apple's Safari Web Extension tools.

## Safety and data boundaries

- The manifest asks for no host permissions. Safari alone receives its required
  local `devtools` permission.
- Commands run only when the CamaDB DevTools panel is open.
- Database discovery uses `indexedDB.databases()` and refuses to open unknown
  names, preventing inspection from accidentally creating an empty database.
- Record browsing is paged in batches of 50.
- Queries keep result counts bounded and stop after an explicit scan limit.
- Replacement preserves `_id`; stale mutations are rejected; deletion requires
  confirmation and writes a recoverable tombstone.
- Diagnostic exports redact record values and identities by default.
- No telemetry or network transport is included.
- Page results are treated as untrusted structured data by the panel.

The page probe understands CamaDB's version-3 IndexedDB record layout. It skips
unrelated object stores and reports only stores with CamaDB record metadata.
Mutations use short IndexedDB transactions and update the authoritative
generation metadata, allowing a live application's derived indexes and cache to
observe the revision and rebuild.
