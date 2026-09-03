const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const candidate = process.argv[2];
if (candidate === 'map') require('../../packages/core/dist/modules/persistence/inmemory/inmemory-persistence').default = require('./map-adapter');
else if (candidate === 'lookup') require('./lookup')();
else if (candidate !== 'baseline') throw new Error('Expected baseline, map or lookup');
const { Cama } = require('../../packages/core/dist');

(async () => {
  const samples = [];
  for (const size of [100, 1000, 10000, 100000]) {
    for (let iteration = 0; iteration < 7; iteration++) {
      const collection = await new Cama({ persistenceAdapter: 'inmemory', cache: { mode: 'disabled' } })
        .initCollection('mixed', { columns: [], indexes: [] });
      const measure = async (operation, repetitions, run, verify) => {
        global.gc?.();
        const heap = process.memoryUsage().heapUsed;
        const started = performance.now();
        let result;
        for (let i = 0; i < repetitions; i++) result = await run(i);
        const elapsedMs = performance.now() - started;
        const heapDeltaBytes = process.memoryUsage().heapUsed - heap;
        verify(result);
        samples.push({ size, iteration, operation, repetitions, elapsedMs, perOperationMs: elapsedMs / repetitions, heapDeltaBytes });
      };
      try {
        for (let start = 0; start < size; start += 10000) await collection.insertMany(
          Array.from({ length: Math.min(10000, size - start) }, (_, i) => ({ _id: String(start + i), value: start + i, group: (start + i) % 10 })));
        await measure('point-read', 100, () => collection.findMany({ _id: String(size - 1) }), result => assert.equal(result.rows[0].value, size - 1));
        await measure('point-update', 25, i => collection.updateMany({ _id: String(i) }, { $inc: { value: 1 } }), result => assert.equal(result.modifiedCount, 1));
        assert.equal((await collection.findMany({ _id: '0' })).rows[0].value, 1);
        await measure('point-delete', 25, i => collection.deleteOne({ _id: String(i) }), result => assert.equal(result.deletedCount, 1));
        await measure('count-all', 25, () => collection.count(), result => assert.equal(result, size - 25));
        await measure('read-all', 10, () => collection.findMany(), result => assert.equal(result.count, size - 25));
        await measure('filtered-read', 10, () => collection.findMany({ group: 3 }, { limit: 5 }), result => {
          assert.equal(result.count, 5); assert.equal(result.totalCount, size / 10 - 3);
        });
        await measure('point-insert', 25, i => collection.insertOne({ _id: 'new-' + i, value: i, group: 9 }), result => assert.equal(result.acknowledged, true));
        assert.equal(await collection.count(), size);
      } finally { await collection.destroy(); }
    }
    console.log(`Completed ${candidate} mixed/${size}`);
  }
  const output = path.resolve(process.argv[3]);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ candidate, node: process.version, generatedAt: new Date().toISOString(),
    note: 'Exploratory expanded workload; not comparable to the original storage harness. Results checked after each operation.', samples }, null, 2) + '\n');
})().catch((error) => { console.error(error); process.exitCode = 1; });
