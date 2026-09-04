const assert = require('assert/strict');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const candidate = process.argv[2];
if (candidate === 'segment') require('../../packages/core/dist/modules/persistence/fs/fs-persistence').default = require('./segment-adapter');
else if (candidate === 'embedded') require('../../packages/core/dist/modules/persistence/fs/fs-persistence').default = require('./embedded-segment-adapter');
else if (candidate === 'record-pages') require('../../packages/core/dist/modules/persistence/fs/fs-persistence').default = require('./record-page-adapter').default;
else if (candidate !== 'baseline') throw new Error('Expected baseline, record-pages, segment or embedded');
const { Cama, PersistenceAdapterEnum } = require('../../packages/core/dist');

(async () => {
  const size = 10_000;
  const iterations = Number(process.argv[4] || 3);
  const samples = [];
  const documents = Array.from({ length: size }, (_, i) => ({ _id: String(i), group: i % 10, value: i }));
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'camadb-fs-mixed-'));
    const open = () => new Cama({ path: root, persistenceAdapter: PersistenceAdapterEnum.FS })
      .initCollection('records', { columns: [], indexes: [] });
    try {
      const collection = await open();
      await collection.insertMany(documents);
      const measure = async (operation, repetitions, action, verify) => {
        global.gc?.();
        const heap = process.memoryUsage().heapUsed;
        const started = performance.now();
        let result;
        for (let i = 0; i < repetitions; i += 1) result = await action();
        const elapsedMs = performance.now() - started;
        verify(result);
        samples.push({ operation, iteration, repetitions, elapsedMs, perOperationMs: elapsedMs / repetitions, heapDeltaBytes: process.memoryUsage().heapUsed - heap });
      };
      await measure('point-read', 50, () => collection.findMany({ _id: '9999' }), (x) => assert.equal(x.rows[0].value, 9999));
      await measure('count-all', 5, () => collection.count(), (x) => assert.equal(x, size));
      await measure('read-all', 3, () => collection.findMany(), (x) => assert.equal(x.count, size));
      await measure('filtered-read', 3, () => collection.findMany({ group: 3 }, { limit: 5 }), (x) => assert.equal(x.totalCount, 1_000));
      await measure('reopen-and-point-read', 3, async () => {
        const reopened = await open();
        return reopened.findMany({ _id: '9999' });
      }, (x) => assert.equal(x.rows[0].value, 9999));
    } finally { await fsp.rm(root, { recursive: true, force: true }); }
  }
  const report = { candidate, generatedAt: new Date().toISOString(), node: process.version, size, iterations, samples,
    note: 'Expanded filesystem workload. Seeding is outside timings. Fresh worktree child process per candidate.' };
  const output = path.resolve(process.argv[3]);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
