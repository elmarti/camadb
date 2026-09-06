const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildSync } = require('esbuild');
const { loadWorkspaces } = require('./affected-workspaces');

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

function installSources(names, publicByName, published) {
  if (published) return names.map((name) => `${name}@${publicByName.get(name).manifest.version}`);
  return names.map((name) => {
    const workspace = publicByName.get(name);
    const output = run('npm', ['pack', '--json', '--pack-destination', packageDirectory], {
      cwd: path.join(root, workspace.directory),
    });
    const [{ filename }] = JSON.parse(output);
    return path.join(packageDirectory, filename);
  });
}

function testSelectedPackages(requestedNames, published = false) {
  const workspaces = loadWorkspaces(root);
  const publicByName = new Map(
    workspaces.filter(({ manifest }) => !manifest.private).map((workspace) => [workspace.name, workspace]),
  );
  const requested = new Set(requestedNames);
  for (const name of requested) {
    if (!publicByName.has(name)) throw new Error(`Unknown public package: ${name}`);
  }

  const included = new Set();
  function include(name) {
    if (included.has(name)) return;
    const workspace = publicByName.get(name);
    if (!workspace) return;
    included.add(name);
    for (const dependency of Object.keys(workspace.manifest.dependencies || {})) include(dependency);
  }
  for (const name of requested) include(name);

  try {
    fs.mkdirSync(packageDirectory, { recursive: true });
    fs.mkdirSync(consumerDirectory, { recursive: true });
    const packagePaths = installSources([...included], publicByName, published);
    write('package.json', JSON.stringify({ name: 'camadb-package-consumer', private: true, type: 'module' }));
    run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', ...packagePaths], {
      cwd: consumerDirectory,
    });

    const commonJs = ["const assert = require('assert');"];
    const esm = ["import assert from 'node:assert';"];
    const types = [];
    const browser = [];
    if (requested.has('@camadb/core')) {
      commonJs.push("const core = require('@camadb/core');", "assert.strictEqual(typeof core.Cama, 'function');");
      esm.push("const core = await import('@camadb/core');", "assert.strictEqual(typeof core.Cama, 'function');");
      types.push(
        "import { Cama, PersistenceAdapterEnum } from '@camadb/core';",
        'void new Cama({ persistenceAdapter: PersistenceAdapterEnum.InMemory });',
      );
      browser.push(
        "import { Cama, PersistenceAdapterEnum } from '@camadb/core';",
        'void new Cama({ persistenceAdapter: PersistenceAdapterEnum.InMemory });',
      );
    }
    if (requested.has('camadb')) {
      commonJs.push(
        "const compatibility = require('camadb');",
        "assert.strictEqual(typeof compatibility.Cama, 'function');",
      );
      esm.push(
        "const compatibility = await import('camadb');",
        "assert.strictEqual(typeof compatibility.Cama, 'function');",
      );
      types.push("import { Cama as CompatibilityCama } from 'camadb';", 'void CompatibilityCama;');
      browser.push("import { Cama as CompatibilityCama } from 'camadb';", 'void CompatibilityCama;');
    }
    if (requested.has('@camadb/memory')) {
      commonJs.push(
        "const memory = require('@camadb/memory');",
        "assert.strictEqual(typeof memory.CamaMemory, 'function');",
      );
      esm.push(
        "const memory = await import('@camadb/memory');",
        "assert.strictEqual(typeof memory.planReembedding, 'function');",
      );
      types.push(
        "import type { MemoryRecord } from '@camadb/memory';",
        'const memoryRecord: MemoryRecord = {} as MemoryRecord;',
        'void memoryRecord;',
      );
      browser.push("import { prepareEmbeddingQuery } from '@camadb/memory';", 'void prepareEmbeddingQuery;');
    }
    if (requested.has('@camadb/sync')) {
      commonJs.push("const sync = require('@camadb/sync');", 'assert.strictEqual(sync.SYNC_PROTOCOL_VERSION, 1);');
      esm.push("const sync = await import('@camadb/sync');", 'assert.strictEqual(sync.SYNC_PROTOCOL_VERSION, 1);');
      types.push(
        "import { LocalSyncReplica, type SyncMutation } from '@camadb/sync';",
        "const replica = new LocalSyncReplica('typed');",
        'void ({} as SyncMutation);',
        'void replica;',
      );
      browser.push("import { LocalSyncReplica } from '@camadb/sync';", "void new LocalSyncReplica('browser');");
    }

    write('require.cjs', `${commonJs.join('\n')}\n`);
    run(process.execPath, ['require.cjs'], { cwd: consumerDirectory });
    write('import.mjs', `${esm.join('\n')}\n`);
    run(process.execPath, ['import.mjs'], { cwd: consumerDirectory });
    write('types.ts', `${types.join('\n')}\n`);
    write(
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true },
      }),
    );
    run(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json'], { cwd: consumerDirectory });
    write('browser-entry.js', `${browser.join('\n')}\n`);
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
    console.log(`Published package consumers passed for: ${[...requested].join(', ')}`);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

const published = process.argv.includes('--published');
const requestedPackages = process.argv.slice(2).filter((argument) => argument !== '--published');
if (requestedPackages.length > 0) {
  testSelectedPackages(requestedPackages, published);
  process.exit(0);
}

try {
  fs.mkdirSync(packageDirectory, { recursive: true });
  fs.mkdirSync(consumerDirectory, { recursive: true });

  const publicByName = new Map(
    loadWorkspaces(root)
      .filter(({ manifest }) => !manifest.private)
      .map((workspace) => [workspace.name, workspace]),
  );
  const packagePaths = installSources(
    ['@camadb/core', '@camadb/memory', '@camadb/sync', 'camadb'],
    publicByName,
    published,
  );

  write('package.json', JSON.stringify({ name: 'camadb-package-consumer', private: true, type: 'module' }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', ...packagePaths], {
    cwd: consumerDirectory,
  });

  write(
    'require.cjs',
    `const assert = require('assert');
const core = require('@camadb/core');
const compatibility = require('camadb');
const memory = require('@camadb/memory');
const sync = require('@camadb/sync');
assert.strictEqual(typeof core.Cama, 'function');
assert.strictEqual(compatibility.Cama, core.Cama);
assert.strictEqual(sync.SYNC_PROTOCOL_VERSION, 1);
assert.deepStrictEqual(
  memory.prepareEmbeddingQuery(
    { provider: 'local', model: 'small', dimensions: 2, schemaVersion: 'v1' },
    {
      embedding: [1, 0],
      provenance: { provider: 'local', model: 'small', dimensions: 2, schemaVersion: 'v1' },
    },
  ),
  [1, 0],
);
(async () => {
  const db = new core.Cama({ persistenceAdapter: core.PersistenceAdapterEnum.InMemory, cache: { mode: 'lru' } });
  const memories = await memory.CamaMemory.create(db, { collectionName: 'consumer-memories' });
  const remembered = await memories.remember({ content: 'local package memory', id: 'memory' });
  assert.strictEqual(remembered.id, 'memory');
  assert.strictEqual((await memories.recall('package'))[0].memory.id, 'memory');
  const source = new sync.LocalSyncReplica('source');
  const target = new sync.LocalSyncReplica('target');
  source.put('notes', { _id: 'one', text: 'local sync' });
  assert.strictEqual((await sync.synchronize(source, target)).applied, 1);
  assert.strictEqual(target.get('notes', 'one').text, 'local sync');
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
import { LocalSyncReplica, synchronize } from '@camadb/sync';
assert.strictEqual(typeof CoreCama, 'function');
assert.strictEqual(CompatibilityCama, CoreCama);
assert.strictEqual(typeof memory.planReembedding, 'function');
assert.strictEqual(typeof memory.CamaMemory, 'function');
const syncSource = new LocalSyncReplica('source');
const syncTarget = new LocalSyncReplica('target');
syncSource.put('notes', { _id: 'one', text: 'ESM sync' });
assert.strictEqual((await synchronize(syncSource, syncTarget)).applied, 1);
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
    'electron-main.cjs',
    `const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Cama, PersistenceAdapterEnum } = require('camadb');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'camadb-electron-main-'));
(async () => {
  try {
    const first = new Cama({ path: root, persistenceAdapter: PersistenceAdapterEnum.FS });
    const collection = await first.initCollection('documents', { columns: [], indexes: [] });
    await collection.insertOne({ _id: 'electron', value: 'persisted from the main process' });

    const reopened = await new Cama({ path: root, persistenceAdapter: PersistenceAdapterEnum.FS })
      .initCollection('documents', { columns: [], indexes: [] });
    assert.deepStrictEqual((await reopened.findMany({ _id: 'electron' })).rows, [
      { _id: 'electron', value: 'persisted from the main process' },
    ]);
    await reopened.destroy();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
`,
  );
  run(process.execPath, ['electron-main.cjs'], { cwd: consumerDirectory });

  write(
    'types.ts',
    `import { Cama, PersistenceAdapterEnum, type ICamaConfig, type CacheConfig, type CacheStats } from '@camadb/core';
import { Cama as CompatibilityCama } from 'camadb';
import type { EmbeddingProfile, MemoryRecord, RememberInput } from '@camadb/memory';
import { LocalSyncReplica, type SyncMutation } from '@camadb/sync';
const cache: CacheConfig = { mode: 'lru', maxBytes: 1024, maxRecords: 10 };
const config: ICamaConfig = { persistenceAdapter: PersistenceAdapterEnum.InMemory, cache };
const embeddingProfile: EmbeddingProfile = {
  provider: 'local',
  model: 'small',
  dimensions: 3,
  schemaVersion: 'v1',
};
async function stats(): Promise<CacheStats> {
  const collection = await database.initCollection('typed', { columns: [], indexes: [] });
  return collection.cacheStats();
}
const database: Cama = new CompatibilityCama(config);
const input: RememberInput<{ source: string }> = { content: 'hello', metadata: { source: 'typed' } };
const memory: MemoryRecord<{ source: string }> = {
  category: 'fact',
  content: input.content,
  createdAt: '2026-09-05T00:00:00.000Z',
  id: 'one',
  metadata: { source: 'typed' },
  schemaVersion: 1,
  updatedAt: '2026-09-05T00:00:00.000Z',
};
const replica = new LocalSyncReplica<{ _id: string; text: string }>('typed');
const mutation: SyncMutation<{ _id: string; text: string }> = replica.put('notes', { _id: 'one', text: 'typed' }).mutation;
void database;
void memory;
void input;
void embeddingProfile;
void mutation;
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
import { CamaMemory, prepareEmbeddingQuery } from '@camadb/memory';
import { LocalSyncReplica, synchronize } from '@camadb/sync';
prepareEmbeddingQuery(
  { provider: 'browser', model: 'small', dimensions: 3, schemaVersion: 'v1' },
  {
    embedding: [1, 0, 0],
    provenance: { provider: 'browser', model: 'small', dimensions: 3, schemaVersion: 'v1' },
  },
);
const database = new Cama({ persistenceAdapter: PersistenceAdapterEnum.InMemory });
const memories = await CamaMemory.create(database, { collectionName: 'browser-memories' });
await memories.remember({ content: 'local browser memory', id: 'browser-memory' });
await memories.recall('browser');
const syncSource = new LocalSyncReplica('browser-source');
const syncTarget = new LocalSyncReplica('browser-target');
syncSource.put('notes', { _id: 'one', text: 'browser sync' });
await synchronize(syncSource, syncTarget);
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

  console.log(
    'Published packages support CommonJS, ESM imports, TypeScript, browser bundling, and an Electron main-process filesystem journey.',
  );
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
