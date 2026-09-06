# Behavioural release journeys

These tests exercise CamaDB through public package entry points rather than package internals. They complement focused unit and adapter-conformance tests by proving that features continue to work together in realistic sequences.

The collection journey runs against in-memory, filesystem, IndexedDB, and localStorage adapters. It covers typed insertion, a rejected duplicate followed by queue continuation, metadata queries, updates, full-text/vector/hybrid retrieval, persistent reopen where supported, deletion, compaction, collection destruction, and recreation. The filesystem case uses the compatibility package entry point expected by a Node.js or Electron main process.

Separate journeys cover filesystem-backed `@camadb/memory` reopen/export/forget behavior and optional `@camadb/sync` offline writes plus interrupted, duplicate-safe replay.

The shared adapter suite runs browser APIs under deterministic emulation in Jest. CI additionally builds the real knowledge demo and drives it through headless Chrome. That journey imports into native IndexedDB, performs hybrid recall and inspection, reloads the page, verifies persistence, deletes the data, and rejects unexpected external HTTP requests.

The packed-package consumer also runs the filesystem lifecycle expected from an Electron main process. Electron renderers use the separately executed browser bundle and must not import the filesystem adapter.
