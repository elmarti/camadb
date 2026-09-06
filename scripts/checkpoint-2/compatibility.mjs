import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, appendFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [oldRoot, newRoot] = process.argv.slice(2);
if (!oldRoot || !newRoot) throw new Error('Usage: compatibility.mjs OLD_PACKAGE_ROOT NEW_PACKAGE_ROOT');
const versions = [oldRoot, newRoot].map((root) => createRequire(path.resolve(root, 'package.json'))('@camadb/core'));
const directory = await mkdtemp(path.join(tmpdir(), 'camadb-compatibility-'));
try {
  for (const [writer, reader] of [versions, [...versions].reverse()]) {
    const name = `records-${versions.indexOf(writer)}`;
    const open = (api) =>
      new api.Cama({ path: directory, persistenceAdapter: api.PersistenceAdapterEnum.FS }).initCollection(name, {
        columns: [],
        indexes: [],
      });
    const collection = await open(writer);
    const rows = Array.from({ length: 512 }, (_, i) => ({
      _id: String(i),
      values: [null, '', '2.00', '9007199254740993', 'café 東京 🌈\n\u0000', String(i)],
    }));
    await collection.insertMany(rows);
    const tail = { _id: 'tail', values: ['NaN', '-Infinity', 'Infinity', '0.00000000000000000001'] };
    await collection.insertOne(tail);
    await collection.deleteOne({ _id: '100' });
    const file = path.join(directory, name, 'records.segment');
    const committed = (await stat(file)).size;
    await appendFile(file, Buffer.from([0, 0, 1, 0, 123]));
    const reopened = await open(reader);
    assert.deepEqual((await reopened.findMany()).rows, [...rows.filter((row) => row._id !== '100'), tail]);
    assert.equal((await stat(file)).size, committed);
    await reopened.insertOne({ _id: 'after-recovery', values: ['exact'] });
    assert.equal((await (await open(writer)).findMany({ _id: 'after-recovery' })).rows[0].values[0], 'exact');
  }
  console.log(
    'PASS: populated format-3 checkpoint/tail, torn-tail recovery, exact values, both writer/reader directions',
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
