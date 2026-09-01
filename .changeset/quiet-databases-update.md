---
'@camadb/core': patch
'camadb': patch
---

Keep localStorage-backed collections consistent after replacing their complete dataset so subsequent reads return the updated rows instead of stale cached data.
