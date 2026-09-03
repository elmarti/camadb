const assert = require('assert/strict');
const { createHasher, jsHash } = require('./hash');
const MapAdapter = require('./map-adapter');
const ArrayAdapter = require('../../packages/core/dist/modules/persistence/inmemory/inmemory-persistence').default;

(async () => {
  const hasher = await createHasher();
  const ids = ['', 'hello', '日本語', '😀', '\ud800', '\udfff', 'a\0b', 'x'.repeat(100000)];
  for (let i = 0; i < 1000; i++) ids.push(String.fromCharCode(i * 63 % 65536) + String(i));
  const expected = Uint32Array.from(ids, jsHash);
  assert.deepEqual(hasher.endToEnd(ids), expected);
  assert.deepEqual(hasher.jsPacked(hasher.pack(ids)), expected);
  for (const id of ids) assert.equal(hasher.single(id), jsHash(id));
  const baseline = new ArrayAdapter();
  const candidate = new MapAdapter();
  let random = 42;
  for (let i = 0; i < 1000; i++) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const id = String(random % 100);
    const mutation = i % 4 ? { puts: [{ _id: id, value: i }] } : { deletes: [id] };
    await baseline.mutateRecords(structuredClone(mutation));
    await candidate.mutateRecords(structuredClone(mutation));
    assert.deepEqual(await candidate.getData(), await baseline.getData());
    assert.deepEqual(await candidate.getRecord(id), await baseline.getRecord(id));
    assert.deepEqual(await candidate.getRecords([id, 'missing']), await baseline.getRecords([id, 'missing']));
    assert.equal(await candidate.cacheRevision(), await baseline.cacheRevision());
  }
  await candidate.insert([{ _id: 'inserted', value: 1 }]);
  const before = await candidate.getData();
  await assert.rejects(candidate.insert([{ _id: 'new' }, { _id: 'inserted' }]));
  assert.deepEqual(await candidate.getData(), before);
  await candidate.destroy();
  await assert.rejects(candidate.getRecord('inserted'));
  const lookup = new ArrayAdapter();
  await lookup.insert(Array.from({ length: 100 }, (_, i) => ({ _id: String(i), value: i })));
  const originalLookup = lookup.getRecords.bind(lookup);
  require('./lookup')();
  for (const keys of [[], ['missing'], ['0'], ['99'], ['0', '99'], ['0', '0'], ['missing', '50']]) {
    assert.deepEqual(await lookup.getRecords(keys), await originalLookup(keys));
  }
  await lookup.destroy();
  await assert.rejects(lookup.getRecords([]));
  console.log('Hash equivalence (including Unicode), 1,000 seeded adapter mutations and lookup fast-path equivalence passed. This is prototype coverage, not production certification.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
