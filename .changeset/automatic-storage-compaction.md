---
'@camadb/core': minor
'camadb': minor
---

Automatically reclaim obsolete record storage at configurable byte/ratio thresholds. Expose collection.compact() and collection.storageStats(), preserve active readers during cleanup, and report maintenance failures without rejecting committed writes.
