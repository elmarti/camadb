const crypto = require('crypto');
const fs = require('fs');
const nodeFs = require('fs').promises;
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');

const root = path.resolve(__dirname, '../..');
const output = process.argv[2] || 'docs/benchmarks/speed-lab/fs-profile-production-2026-09-03.json';
const size = Number(process.argv[3] || 10_000);
const samples = Number(process.argv[4] || 3);
const Fs = require('../../packages/core/dist/modules/persistence/fs/fs').Fs;
const FSPersistence = require('../../packages/core/dist/modules/persistence/fs/fs-persistence').default;
const { Cama, PersistenceAdapterEnum } = require('../../packages/core/dist');

const metrics = new Map();
const wrap = (prototype, owner, method) => {
  const original = prototype[method];
  if (typeof original !== 'function') return;
  prototype[method] = async function (...args) {
    const started = performance.now();
    try {
      return await original.apply(this, args);
    } finally {
      const key = `${owner}.${method}`;
      const current = metrics.get(key) || { calls: 0, milliseconds: 0 };
      current.calls += 1;
      current.milliseconds += performance.now() - started;
      metrics.set(key, current);
    }
  };
};

for (const method of [
  'replaceFile', 'syncContainingDirectory', 'writeJSON', 'loadJSON', 'exists', 'mkdir',
  'readDir', 'rmFile', 'fileSize',
]) wrap(Fs.prototype, 'Fs', method);
for (const method of [
  'getRecords', 'readRecordsSnapshot', 'mutateRecords', 'applyMutation', 'writePages',
  'readShard', 'readManifest', 'autoCompact',
]) wrap(FSPersistence.prototype, 'FSPersistence', method);

const documents = Array.from({ length: size }, (_, index) => ({
  _id: String(index), group: index % 10, value: `profile-row-${index}`,
}));
const reset = () => metrics.clear();
const snapshot = () => Object.fromEntries(
  [...metrics].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [key, {
    calls: value.calls,
    milliseconds: Number(value.milliseconds.toFixed(6)),
  }]),
);

const withCollection = async (name, seed) => {
  const storagePath = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'camadb-fs-profile-'));
  const database = new Cama({ path: storagePath, persistenceAdapter: PersistenceAdapterEnum.FS });
  const collection = await database.initCollection(name, { columns: [], indexes: [] });
  if (seed) await collection.insertMany(documents);
  return { collection, storagePath };
};

const measure = async (operation, action, seed) => {
  const runs = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const { collection, storagePath } = await withCollection(`${operation}-${sample}`, seed);
    reset();
    const started = performance.now();
    await action(collection);
    const milliseconds = performance.now() - started;
    runs.push({ sample, milliseconds: Number(milliseconds.toFixed(6)), methods: snapshot() });
    await nodeFs.rm(storagePath, { recursive: true, force: true });
  }
  return { operation, runs };
};

const sourceHash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function main() {
  const operations = [];
  operations.push(await measure('bulk-insert', (collection) => collection.insertMany(documents), false));
  operations.push(await measure('point-read', (collection) => collection.findMany({ _id: String(size >> 1) }), true));
  operations.push(await measure('point-update', (collection) => collection.updateMany(
    { _id: String(size >> 1) }, { $set: { value: 'updated' } },
  ), true));
  operations.push(await measure('point-delete', (collection) => collection.deleteOne({ _id: String(size >> 1) }), true));
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    note: 'Inclusive method timings can overlap and must not be summed. Collection seeding is outside each measured operation.',
    baseRevision: '6b914a3',
    size,
    samples,
    runtime: { node: process.version, platform: process.platform, architecture: process.arch, cpu: os.cpus()[0]?.model },
    sourceHashes: {
      'packages/core/src/modules/persistence/fs/fs.ts': sourceHash(path.join(root, 'packages/core/src/modules/persistence/fs/fs.ts')),
      'packages/core/src/modules/persistence/fs/fs-persistence.ts': sourceHash(path.join(root, 'packages/core/src/modules/persistence/fs/fs-persistence.ts')),
      'scripts/speed-lab/profile-fs.js': sourceHash(__filename),
    },
    operations,
  };
  const outputPath = path.resolve(root, output);
  await nodeFs.mkdir(path.dirname(outputPath), { recursive: true });
  await nodeFs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
