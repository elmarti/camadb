---
'@camadb/core': patch
'camadb': patch
---

Preserve sibling IndexedDB collections when deleting and recreating a collection, close stale managed connections during cross-tab upgrades, report blocked schema changes without hanging, and retain clear errors when a destroyed collection instance is reused.
