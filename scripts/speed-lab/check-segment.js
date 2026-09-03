const assert = require('assert/strict');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const candidate = process.argv[2] || 'segment';
require('../../packages/core/dist/modules/persistence/fs/fs-persistence').default = require(
  candidate === 'embedded' ? './embedded-segment-adapter' : './segment-adapter',
);
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

    const segment = path.join(root, 'records', candidate === 'embedded' ? 'records.embedded-segment' : 'records.segment');
    const committedSize = (await fs.stat(segment)).size;
    const incomplete = Buffer.alloc(12);
    incomplete.writeUInt32BE(1_000, 0);
    await fs.appendFile(segment, incomplete);
    const afterInterruption = await open();
    assert.equal(await afterInterruption.count(), 999);
    assert.equal((await fs.stat(segment)).size, committedSize);

    if (candidate === 'embedded') {
      const corruptTrailer = Buffer.alloc(24);
      Buffer.from('CAMATRL1').copy(corruptTrailer);
      corruptTrailer.writeBigUInt64BE(BigInt(committedSize), 8);
      corruptTrailer.writeUInt32BE(64, 16);
      corruptTrailer.writeUInt32BE(0xdeadbeef, 20);
      await fs.appendFile(segment, corruptTrailer);
      const afterCorruptTrailer = await open();
      assert.equal(await afterCorruptTrailer.count(), 999);
      assert.equal((await fs.stat(segment)).size, committedSize);
    }

    process.stdout.write('Segment recovery, update, delete and invalid-tail truncation passed.\n');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
