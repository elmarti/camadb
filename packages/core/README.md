# @camadb/core

The database, collection/query model, built-in compatibility adapters, and shared public types for CamaDB.

The package currently retains the legacy adapter selector so existing `camadb` configurations remain compatible. New adapters must depend only on this package's public contracts; adapter-specific entry points will be extracted in the next compatibility-safe step.

## Runtime and module support

CamaDB supports maintained Node.js releases from Node.js 22 onward. The package publishes CommonJS for compatibility and exposes that entry point explicitly to both `require()` and ESM `import`. Browser bundling is supported for non-filesystem adapters; Electron main processes use the Node.js path and renderer processes use the browser path.
