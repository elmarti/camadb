---
'@camadb/core': patch
---

Keep filesystem-only Buffer access out of browser module initialization so IndexedDB applications can load the shared core bundle.
