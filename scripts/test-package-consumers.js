const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'camadb-package-consumers-'));
const packageDirectory = path.join(temporaryRoot, 'packages');
const consumerDirectory = path.join(temporaryRoot, 'consumer');
const npmCache = path.join(temporaryRoot, 'npm-cache');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: 'utf8',
    env: { ...process.env, npm_config_cache: npmCache },
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
  return result.stdout;
}

function write(relativePath, contents) {
  const destination = path.join(consumerDirectory, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, contents);
}

try {
  fs.mkdirSync(packageDirectory, { recursive: true });
  fs.mkdirSync(consumerDirectory, { recursive: true });

  const packagePaths = ['core', 'memory', 'camadb'].map((name) => {
    const output = run('npm', ['pack', '--json', '--pack-destination', packageDirectory], {
      cwd: path.join(root, 'packages', name),
    });
    const [{ filename }] = JSON.parse(output);
    return path.join(packageDirectory, filename);
  });

  write('package.json', JSON.stringify({ name: 'camadb-package-consumer', private: true, type: 'module' }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', ...packagePaths], {
    cwd: consumerDirectory,
  });

  write(
    'require.cjs',
    `const assert = require('assert');
const core = require('@camadb/core');
const compatibility = require('camadb');
require('@camadb/memory');
assert.strictEqual(typeof core.Cama, 'function');
assert.strictEqual(compatibility.Cama, core.Cama);
(async () => {
  const db = new core.Cama({ persistenceAdapter: core.PersistenceAdapterEnum.InMemory, cache: { mode: 'lru' } });
  const collection = await db.initCollection('cached', { columns: [], indexes: [] });
  await collection.insertOne({ _id: 'a', value: 1 });
  await collection.findMany({ _id: 'a' });
  await collection.findMany({ _id: 'a' });
  assert.strictEqual(collection.cacheStats().hits, 1);
  await collection.destroy();
})().catch((error) => { console.error(error); process.exitCode = 1; });
`,
  );
  run(process.execPath, ['require.cjs'], { cwd: consumerDirectory });

  write(
    'import.mjs',
    `import assert from 'node:assert';
import { Cama as CoreCama, PersistenceAdapterEnum } from '@camadb/core';
import { Cama as CompatibilityCama } from 'camadb';
import * as memory from '@camadb/memory';
assert.strictEqual(typeof CoreCama, 'function');
assert.strictEqual(CompatibilityCama, CoreCama);
assert.ok(memory);
const db = new CoreCama({ persistenceAdapter: PersistenceAdapterEnum.InMemory, cache: { mode: 'lazy' } });
const collection = await db.initCollection('cached', { columns: [], indexes: [] });
await collection.insertOne({ _id: 'a', value: 1 });
await collection.findMany({ _id: 'a' });
await collection.findMany({ _id: 'a' });
assert.strictEqual(collection.cacheStats().hits, 1);
collection.clearCache();
assert.strictEqual(collection.cacheStats().records, 0);
await collection.destroy();
`,
  );
  run(process.execPath, ['import.mjs'], { cwd: consumerDirectory });

  write(
    'types.ts',
    `import { Cama, PersistenceAdapterEnum, type ICamaConfig, type CacheConfig, type CacheStats } from '@camadb/core';
import { Cama as CompatibilityCama } from 'camadb';
import type { MemoryRecord } from '@camadb/memory';
const cache: CacheConfig = { mode: 'lru', maxBytes: 1024, maxRecords: 10 };
const config: ICamaConfig = { persistenceAdapter: PersistenceAdapterEnum.InMemory, cache };
async function stats(): Promise<CacheStats> {
  const collection = await database.initCollection('typed', { columns: [], indexes: [] });
  return collection.cacheStats();
}
const database: Cama = new CompatibilityCama(config);
const memory: MemoryRecord = { id: 'one', content: 'hello' };
void database;
void memory;
`,
  );
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true },
    }),
  );
  run(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json'], { cwd: consumerDirectory });

  write(
    'browser-entry.js',
    `import { Cama, PersistenceAdapterEnum } from '@camadb/core';
const database = new Cama({ persistenceAdapter: PersistenceAdapterEnum.InMemory });
const collection = await database.initCollection('searchable', {
  columns: [],
  indexes: [],
  searchIndexes: ['body'],
  vectorIndexes: [{ field: 'embedding', dimensions: 3 }],
});
await collection.insertOne({ body: 'local browser search', embedding: [1, 0, 0] });
await collection.searchText('browser');
await collection.searchVector('embedding', [1, 0, 0]);
await collection.searchHybrid({
  fusion: { strategy: 'rrf', textWeight: 1, vectorWeight: 1 },
  text: { query: 'browser' },
  vector: { field: 'embedding', query: [1, 0, 0] },
});
`,
  );
  buildSync({
    absWorkingDir: consumerDirectory,
    entryPoints: ['browser-entry.js'],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    outfile: path.join(consumerDirectory, 'browser-bundle.js'),
    logLevel: 'silent',
  });
  assert.ok(fs.statSync(path.join(consumerDirectory, 'browser-bundle.js')).size > 0);

  console.log('Published packages support CommonJS, ESM imports, TypeScript, and browser bundling.');
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
