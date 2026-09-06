// Public API workload; run each case in a separate Node process (see investigation).
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir, cpus, release } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Session } from 'node:inspector';

const [packageRoot, report, countText = '100000', shape = 'narrow', cacheMode = 'lru', pageMode = 'parallel'] =
  process.argv.slice(2);
if (!packageRoot || !report)
  throw new Error('Usage: profile.mjs PACKAGE_ROOT REPORT [ROWS] [narrow|wide] [lru|disabled] [parallel|serial]');
const require = createRequire(path.resolve(packageRoot, 'package.json'));
const { Cama, PersistenceAdapterEnum } = require('@camadb/core');
const count = Number(countText);
const directory = await mkdtemp(path.join(tmpdir(), 'camadb-profile-'));
const result = {
  node: process.version,
  platform: `${process.platform} ${release()} ${process.arch}`,
  cpu: cpus()[0].model,
  packageRoot,
  count,
  shape,
  cacheMode,
  pageMode,
  phases: [],
  samples: [],
  peak: {},
  status: 'running',
};
let phase = 'initialize';
const sample = () => {
  const memory = process.memoryUsage();
  for (const [key, value] of Object.entries(memory)) result.peak[key] = Math.max(result.peak[key] ?? 0, value);
  return memory;
};
const timer = setInterval(sample, 50);
const config = {
  path: directory,
  persistenceAdapter: PersistenceAdapterEnum.FS,
  cache: { mode: cacheMode, maxBytes: 8 * 1024 ** 2, maxRecords: 1000 },
};
const open = () => new Cama(config).initCollection('result', { columns: [], indexes: ['lookup'] });
const mark = (label, started, collection) =>
  result.phases.push({ label, ms: performance.now() - started, memory: sample(), cache: collection.cacheStats() });
const inspector = new Session();
inspector.connect();
const post = (method, params = {}) =>
  new Promise((resolve, reject) =>
    inspector.post(method, params, (error, value) => (error ? reject(error) : resolve(value))),
  );
// Sampling allocation profiling is opt-in, so timing runs do not pay its cost.
if (process.env.PROFILE_ALLOCATIONS)
  await post('HeapProfiler.startSampling', {
    samplingInterval: 32768,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });
try {
  let collection = await open();
  phase = 'capture';
  let started = performance.now();
  for (let offset = 0; offset < count; offset += 100) {
    const rows = Array.from({ length: Math.min(100, count - offset) }, (_, index) => {
      const n = offset + index + 1;
      const amount = BigInt(n) * 1713n;
      const values = [String(n), `${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`, `category-${n % 10}`];
      if (shape === 'wide')
        values.push('Notes: café 東京 🌈 '.repeat(64), ...Array.from({ length: 8 }, (_, i) => `column${i}-`.repeat(8)));
      return { _id: `r:${n - 1}`, kind: 'row', queryId: '', position: n - 1, values, lookup: values[2] };
    });
    await collection.insertMany(rows);
    result.rowsCommitted = offset + rows.length;
    const memory = sample();
    if (result.rowsCommitted % 25600 === 0 || result.rowsCommitted === count)
      result.samples.push({ rows: result.rowsCommitted, phase, ...memory });
    if (memory.rss > 768 * 1024 ** 2) {
      result.status = '768 MiB safety stop';
      break;
    }
  }
  mark(phase, started, collection);
  result.storage = await collection.storageStats();
  if (process.env.PROFILE_ALLOCATIONS) {
    const profile = await post('HeapProfiler.stopSampling');
    const allocations = [];
    const visit = (node, stack = []) => {
      const frame = node.callFrame;
      const next = [...stack, `${frame.functionName || '(anonymous)'} ${frame.url}:${frame.lineNumber + 1}`];
      if (node.selfSize) allocations.push({ sampledBytes: node.selfSize, stack: next.slice(-6) });
      for (const child of node.children) visit(child, next);
    };
    visit(profile.profile.head);
    result.allocations = allocations.sort((a, b) => b.sampledBytes - a.sampledBytes).slice(0, 30);
  }
  global.gc?.();
  result.liveCollectionAfterGC = sample();
  if (result.rowsCommitted === count) {
    collection = undefined;
    global.gc?.();
    result.afterCaptureGC = sample();
    phase = 'cold-first-page';
    started = performance.now();
    collection = await open();
    const read = async (i) => (await collection.findMany({ _id: `r:${i}` }, { limit: 1 })).rows[0];
    const rows = pageMode === 'parallel' ? await Promise.all(Array.from({ length: 100 }, (_, i) => read(i))) : [];
    if (pageMode === 'serial') for (let i = 0; i < 100; i++) rows.push(await read(i));
    assert.deepEqual(
      rows.map((row) => row.position),
      Array.from({ length: 100 }, (_, i) => i),
    );
    mark(phase, started, collection);
    // Wide 100k views exceed the consumer's 32 MiB envelope. Do not knowingly
    // materialize that payload twice under the benchmark's 512 MiB heap cap.
    for (const indexed of shape === 'wide' && count > 10000 ? [] : [true, false]) {
      phase = indexed ? 'cold-index-filter-sort' : 'unindexed-filter-sort';
      started = performance.now();
      const query = { [indexed ? 'lookup' : 'values.2']: 'category-2', position: { $lt: count } };
      // This fixture's decimal values are positive and monotonic: position gives
      // the exact same order without introducing Number coercion of source text.
      const view = await collection.findMany(query, { limit: 100000, sort: { desc: (row) => row.position } });
      assert.equal(view.totalCount, Math.floor((count + 8) / 10));
      assert(
        view.rows.every((row, i) => row.values[2] === 'category-2' && (!i || view.rows[i - 1].position > row.position)),
      );
      mark(phase, started, collection);
    }
    global.gc?.();
    result.afterViewsGC = sample();
    result.status = 'complete';
  }
} catch (error) {
  result.status = 'error';
  result.error = `${phase}: ${error.stack}`;
  process.exitCode = 1;
} finally {
  clearInterval(timer);
  result.maxRssBytes = process.resourceUsage().maxRSS * 1024;
  inspector.disconnect();
  await writeFile(report, `${JSON.stringify(result, null, 2)}\n`);
  await rm(directory, { recursive: true, force: true });
  console.log(
    JSON.stringify({
      report,
      status: result.status,
      rows: result.rowsCommitted,
      phases: result.phases.map(({ label, ms }) => ({ label, ms })),
      peak: result.peak,
    }),
  );
}
