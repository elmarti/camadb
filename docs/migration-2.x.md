# 2.x and 3.x compatibility policy

The 3.x workspace does not silently remove supported 2.x imports. The unscoped `camadb` package remains a compatibility facade and `import { Cama, Collection } from 'camadb'` continues to resolve. Existing configuration values (`fs`, `indexeddb`, `localstorage`, and `inmemory`) remain supported during the adapter extraction period.

For all 3.x releases:

- documented 2.x root exports remain available from `camadb`, or receive a deprecation period and migration path before removal;
- internal paths were never public and are intentionally blocked by package exports;
- persisted 2.x data is detected and refused without modification;
- adapter extraction must preserve legacy configuration through a compatibility bridge for the full 3.x line;
- breaking changes require a major version and explicit migration notes.

New code should prefer `@camadb/core`. Moving to the scoped package changes ownership clarity, not database behavior.

## Storage compatibility

CamaDB 2.x stored bare collection arrays. Version 3 uses a different record-oriented format and does not open or convert 2.x filesystem, localStorage, or IndexedDB stores. Detection is deliberately read-only:

```ts
import { detectStorage } from '@camadb/core';

const status = detectStorage(storedValue);
if (status.kind === 'legacy') {
  // Continue using CamaDB 2, or choose a new location for a CamaDB 3 store.
}
```

Opening a legacy store throws `LegacyStorageError` with code `CAMADB_LEGACY_STORAGE`. Detection and the failed open do not rewrite, delete, or reinterpret the legacy value.

### Moving data manually

Applications that need existing data should continue running CamaDB 2, export their documents through the application's normal read API, and import them into a new CamaDB 3 database. CamaDB does not provide an in-place conversion or rollback API.

Keep the original 2.x store unchanged until the new database has been independently validated. Do not point a 2.x process at a V3 store or a V3 process at a V2 store.

Unknown envelope versions are rejected. They are never treated as legacy data or rewritten speculatively.
