# Decision 0003: Cama Studio is a cross-browser DevTools extension

Status: accepted for #89.

## Decision

Ship the first Cama Studio preview as a WebExtension DevTools panel from a
single WXT, React, and TypeScript codebase. Generate separate Chromium, Firefox,
and Safari artifacts while keeping the application UI and typed inspection
protocol browser-independent. Reuse `@camadb/design` rather than introducing an
extension-specific visual system.

The extension inspects CamaDB inside the origin attached to Developer Tools.
It does not attempt to read browser profile files and does not request ambient
access to every website. The initial implementation uses the common
`devtools_page`, panel, and inspected-window API subset, with no host
permissions, telemetry, or remote service. Safari's build declares only the
`devtools` permission required to add its Web Inspector tab.

## Data and performance boundaries

Inspection must preserve the database's bounded-storage guarantees:

- list only existing databases and never create one during discovery;
- read records through cursors in bounded pages;
- cap query results and scanned records independently;
- return explicit scan and truncation metadata;
- render large result sets incrementally or with virtualization;
- never hydrate or serialize a complete collection merely to populate a view.

Discovery and querying are read-only. Record replacement and deletion use short
transactions that preserve `_id`, sequence, generation, and tombstone semantics.
The record generation is checked optimistically so a stale Studio panel cannot
overwrite a newer application mutation. The revision change causes live derived
indexes and caches to rebuild before their next operation. Destructive actions
require confirmation, and diagnostic exports redact record values and identities
by default. Broader operations such as collection deletion and compaction remain
outside this initial capability set until a versioned CamaDB inspection bridge
can expose them explicitly.

## Compatibility

Chromium and Firefox are the primary development and automated-test targets.
Safari is built from the same source, then packaged and signed using Apple's
Safari Web Extension tooling. Browser-specific behavior belongs in transport
adapters; protocol and UI code must not depend on a vendor namespace.

## Continuous integration

Pull-request validation resolves changed workspaces from the Git diff, expands
them to include downstream workspace dependants, and builds only the affected
graph and its prerequisites. Changes to shared build or CI configuration remain
conservative and validate the complete monorepo. Website deployment is scoped
to the website, embedded demo, and their dependencies; application-only changes
do not start npm publishing. Changesets remain the authority for selecting which
versioned packages are published.

An eventual Electron data client is a separate project. It may consume the same
inspection protocol through an authenticated extension connector while adding
filesystem databases and larger local workflows. That future transport must be
streamed, cancellable, authenticated, and benchmarked before it is enabled.
