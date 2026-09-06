# Behavioural release journeys

These tests exercise CamaDB through public package entry points rather than package internals. They complement focused unit and adapter-conformance tests by proving that features continue to work together in realistic sequences.

The collection journey runs against in-memory, filesystem, IndexedDB, and localStorage adapters. It covers typed insertion, a rejected duplicate followed by queue continuation, metadata queries, updates, full-text/vector/hybrid retrieval, persistent reopen where supported, deletion, compaction, collection destruction, and recreation. The filesystem case uses the compatibility package entry point expected by a Node.js or Electron main process.

Separate journeys cover filesystem-backed `@camadb/memory` reopen/export/forget behavior and optional `@camadb/sync` offline writes plus interrupted, duplicate-safe replay.

The browser adapters run under deterministic API emulation in Jest. This is a release gate for shared behavior, not a substitute for the clean-browser interactive demo or extension smoke tests.
