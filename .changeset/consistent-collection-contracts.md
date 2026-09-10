---
'@camadb/core': patch
---

Validate collection names before creating persistence adapters, await metadata readiness before returning initialized collections, and enforce the catalogue metadata bounds on creation, reopening and updates. Reject invalid names and out-of-bounds metadata without silently rewriting existing stores. Propagate initialization errors while handling constructor-started promise rejections.
