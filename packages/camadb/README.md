# camadb

Compatibility package name. It re-exports the CamaDB 3 core API so applications can retain `import { Cama } from 'camadb'`; it does not make the breaking v3 typed collection API or storage format compatible with v2. New code may import from `@camadb/core`.

Requires Node.js 22 or newer when used in Node.js. Both CommonJS `require()` and ESM `import` resolve through the package's explicit public entry point.
