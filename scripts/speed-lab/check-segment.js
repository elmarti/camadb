const assert = require('assert/strict');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

require('../../packages/core/dist/modules/persistence/fs/fs-persistence').default = require('./segment-adapter');
const { Cama, PersistenceAdapterEnum } = require('../../packages/core/dist');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'camadb-segment-check-'));
  const open = () => new Cama({ path: root, persistenceAdapter: PersistenceAdapterEnum.FS })
    .initCollection('records', { columns: [], indexes: [] });
  try {
    const first = await open();
    await first.insertMany(Array.from({ length: 1_000 }, (_, i) => ({ _id: String(i), value: i })));
    await first.updateMany({ _id: '500' }, { $set: { value: 'updated' } });
    await first.deleteOne({ _id: '501' });

    const recovered = await open();
    assert.equal((await recovered.findMany({ _id: '500' })).rows[0].value, 'updated');
    assert.equal((await recovered.findMany({ _id: '501' })).count, 0);
    assert.equal(await recovered.count(), 999);

    const segment = path.join(root, 'records', 'records.segment');
    const committedSize = (await fs.stat(segment)).size;
    const incomplete = Buffer.alloc(12);
    incomplete.writeUInt32BE(1_000, 0);
    await fs.appendFile(segment, incomplete);
    const afterInterruption = await open();
    assert.equal(await afterInterruption.count(), 999);
    assert.equal((await fs.stat(segment)).size, committedSize);
    process.stdout.write('Segment recovery, update, delete and incomplete-tail truncation passed.\n');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
