# @camadb/core

The database, collection/query model, built-in compatibility adapters, and shared public types for CamaDB.

The package currently retains the legacy adapter selector so existing `camadb` configurations remain compatible. New adapters must depend only on this package's public contracts; adapter-specific entry points will be extracted in the next compatibility-safe step.
