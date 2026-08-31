# camadb

Compatibility entry point. Existing `import { Cama } from 'camadb'` consumers continue to work while new code may import from `@camadb/core`.

Requires Node.js 22 or newer when used in Node.js. Both CommonJS `require()` and ESM `import` resolve through the package's explicit public entry point.
