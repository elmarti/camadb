# Published CamaDB 2.0.0 storage fixtures

These fixtures reproduce the formats emitted by the `2.0.0` git tag:

- `fs/people/data` is the exact output of the tagged `FlattedSerializer` for the fixture row.
- `localstorage.json` is the exact JSON value written under `<database>-<collection>-data`.
- `indexeddb.json` records the version-1 database, object-store, key, and bare-array value used by the tagged IndexedDB adapter.

Keep these files immutable. Tests use them to ensure detection and reads never rewrite legacy storage.
