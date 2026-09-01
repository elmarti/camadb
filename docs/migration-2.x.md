# 2.x migration and compatibility policy

The 3.x workspace does not silently remove supported 2.x imports. The unscoped `camadb` package remains a compatibility facade and `import { Cama, Collection } from 'camadb'` continues to resolve. Existing configuration values (`fs`, `indexeddb`, `localstorage`, and `inmemory`) remain supported during the adapter extraction period.

For all 3.x releases:

- documented 2.x root exports remain available from `camadb`, or receive a deprecation period and migration path before removal;
- internal paths were never public and are intentionally blocked by package exports;
- persisted data changes require a forward migration, rollback guidance, and fixtures tested against the prior format;
- adapter extraction must preserve legacy configuration through a compatibility bridge for the full 3.x line;
- breaking changes require a major version and explicit migration notes.

New code should prefer `@camadb/core`. Moving to the scoped package changes ownership clarity, not database behavior.

## Storage detection and migration

CamaDB 2.x stored bare collection arrays. Version 3 wraps new writes in a versioned collection envelope. Reading legacy filesystem, localStorage, or IndexedDB data remains compatible and does **not** rewrite it. Detection is deliberately read-only:

```ts
import { detectStorage, migrateLegacyStorage } from '@camadb/core';

const status = detectStorage(storedValue);
if (status.kind === 'legacy') {
  const migratedValue = migrateLegacyStorage(storedValue);
  // Persist migratedValue only after the application has created a backup.
}
```

Migration is an explicit application decision. `migrateLegacyStorage` only produces the value to persist; it never writes to a filesystem, browser storage, or IndexedDB. Repeating it for an already migrated value is safe.

### Backup and rollback

Before replacing 2.x storage, copy the complete database location: the `.cama` directory for filesystem databases, all matching `<database>-<collection>-data` keys for localStorage, or the entire IndexedDB database. Keep that backup until the upgraded application has exercised every collection.

To roll back, stop all writers, restore the backup, and restart the 2.x application. If only a migrated value is available, call `exportLegacyStorage(envelope)` and persist the returned bare array using the same adapter key or file location. Do not ask a 2.x process to open a v3 envelope directly.

Unknown envelope versions are rejected. They are never treated as legacy data or rewritten speculatively.
