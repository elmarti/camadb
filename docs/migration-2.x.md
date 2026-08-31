# 2.x migration and compatibility policy

The 3.x workspace does not silently remove supported 2.x imports. The unscoped `camadb` package remains a compatibility facade and `import { Cama, Collection } from 'camadb'` continues to resolve. Existing configuration values (`fs`, `indexeddb`, `localstorage`, and `inmemory`) remain supported during the adapter extraction period.

For all 3.x releases:

- documented 2.x root exports remain available from `camadb`, or receive a deprecation period and migration path before removal;
- internal paths were never public and are intentionally blocked by package exports;
- persisted data changes require a forward migration, rollback guidance, and fixtures tested against the prior format;
- adapter extraction must preserve legacy configuration through a compatibility bridge for the full 3.x line;
- breaking changes require a major version and explicit migration notes.

New code should prefer `@camadb/core`. Moving to the scoped package changes ownership clarity, not database behavior.
