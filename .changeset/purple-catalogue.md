---
'@camadb/core': minor
---

Add an adapter-level collection catalogue capability with bounded, read-only filesystem and IndexedDB discovery, existence checks and declared column/index metadata through public Cama methods. Catalogue reads never initialize collections or read document payloads. IndexedDB inspection uses readonly metadata transactions and aborts initial creation upgrades so a missing database is not persisted. Unsupported adapters fail explicitly. Document pagination, concurrency and metadata validation limits, with shared adapter conformance tests and real-browser IndexedDB acceptance.
