import { Cama, PersistenceAdapterEnum } from '../../../index';
import { CacheMode } from '../../../interfaces/cache.interface';
import { CachedPersistence } from '../cached-persistence';
import InmemoryPersistence from '../inmemory/inmemory-persistence';
import { serializedBytes } from '../compaction';

const rows = ['a', 'b', 'c'].map((_id) => ({ _id, nested: { value: _id } }));

async function setup(mode: CacheMode, maxRecords = 2, maxBytes = 1024) {
  const storage = new InmemoryPersistence();
  await storage.insert(structuredClone(rows));
  const cache = new CachedPersistence(storage, { mode, maxRecords, maxBytes });
  return { storage, cache };
}

it('defaults to disabled without revision reads or retained records', async () => {
  const { storage, cache } = await setup('disabled');
  const revision = jest.spyOn(storage, 'cacheRevision');
  await cache.getRecord('a');
  await cache.getRecord('a');
  expect(revision).not.toHaveBeenCalled();
  expect(cache.cacheStats()).toMatchObject({ records: 0, bytes: 0, hits: 0 });
});

it('lazily admits records and stops admission at its budget', async () => {
  const { storage, cache } = await setup('lazy');
  const reads = jest.spyOn(storage, 'getRecords');
  await cache.initializeCache();
  expect(cache.cacheStats().records).toBe(0);
  await cache.getRecord('a');
  await cache.getRecord('b');
  await cache.getRecord('c');
  await cache.getRecord('a');
  expect(reads).toHaveBeenCalledTimes(3);
  expect(cache.cacheStats()).toMatchObject({ records: 2, hits: 1, misses: 3, evictions: 0, skipped: 1 });
});

it('warms eager caches in storage order without exceeding capacity', async () => {
  const { storage, cache } = await setup('eager');
  const reads = jest.spyOn(storage, 'getRecords');
  await cache.initializeCache();
  expect(cache.cacheStats().records).toBe(2);
  await cache.getRecord('a');
  await cache.getRecord('b');
  expect(reads).not.toHaveBeenCalled();
  await cache.getRecord('c');
  expect(reads).toHaveBeenCalledTimes(1);
});

it('evicts the least recently used record, not the most recently inserted', async () => {
  const { cache } = await setup('lru');
  await cache.getRecord('a');
  await cache.getRecord('b');
  await cache.getRecord('a');
  await cache.getRecord('c');
  await cache.getRecord('a');
  expect(cache.cacheStats()).toMatchObject({ hits: 2, evictions: 1, records: 2 });
  await cache.getRecord('b');
  expect(cache.cacheStats()).toMatchObject({ misses: 4, evictions: 2 });
});

it('accounts for UTF-8 bytes and bypasses oversized records without evicting useful ones', async () => {
  const small = { _id: 'a', value: '🦉' };
  const budget = serializedBytes(small) + serializedBytes('a');
  const { storage, cache } = await setup('lru', 10, budget);
  await storage.update([small, { _id: 'big', value: 'x'.repeat(1000) }]);
  await cache.getRecord('a');
  await cache.getRecord('big');
  expect(cache.cacheStats()).toMatchObject({ records: 1, bytes: budget, skipped: 1, evictions: 0 });
});

it.each(['eager', 'lazy', 'lru'] as CacheMode[])('supports zero capacity in %s mode', async (mode) => {
  const { cache } = await setup(mode, 0, 0);
  await expect(cache.getRecord('a')).resolves.toEqual(rows[0]);
  expect(cache.cacheStats()).toMatchObject({ records: 0, bytes: 0 });
});

it('rejects invalid limits and mode names', () => {
  for (const maxBytes of [-1, NaN, Infinity, 0.5]) {
    expect(() => new CachedPersistence(new InmemoryPersistence(), { mode: 'lru', maxBytes })).toThrow('Cache limits');
  }
  expect(() => new CachedPersistence(new InmemoryPersistence(), { mode: 'bad' as CacheMode })).toThrow('Unknown cache');
});

it('does not expose cache references to callers or retain scan results', async () => {
  const { cache } = await setup('lazy');
  const first = await cache.getRecord('a');
  first.nested.value = 'changed';
  const hit = await cache.getRecord('a');
  hit.nested.value = 'changed again';
  expect(await cache.getRecord('a')).toEqual(rows[0]);
  cache.clearCache();
  const scan = await cache.getData();
  scan[0].nested.value = 'scan change';
  expect(await cache.getRecord('a')).toEqual(rows[0]);
  expect(cache.cacheStats().records).toBe(1);
});

it('invalidates after a rejected write and continues serving successful mutations', async () => {
  const { storage, cache } = await setup('lazy');
  await cache.getRecord('a');
  jest.spyOn(storage, 'mutateRecords').mockRejectedValueOnce(new Error('interrupted'));
  await expect(cache.mutateRecords({ deletes: ['a'] })).rejects.toThrow('interrupted');
  expect(cache.cacheStats().records).toBe(0);
  expect(await cache.getRecord('a')).toEqual(rows[0]);
  await cache.mutateRecords({ puts: [{ _id: 'a', value: 9 }] });
  expect(await cache.getRecord('a')).toEqual({ _id: 'a', value: 9 });
});

it('bypasses non-JSON payloads whose serialized size would hide their memory use', async () => {
  const { storage, cache } = await setup('lru');
  await storage.update([
    { _id: 'binary', value: new ArrayBuffer(4096) },
    { _id: 'date', value: new Date(0) },
  ]);
  expect((await cache.getRecord('binary')).value.byteLength).toBe(4096);
  expect((await cache.getRecord('date')).value.getTime()).toBe(0);
  expect(cache.cacheStats()).toMatchObject({ records: 0, skipped: 2 });
});

it('copies inputs so callers cannot mutate storage behind a warm cache', async () => {
  const { cache } = await setup('lazy');
  const input = { _id: 'a', nested: { value: 'original' } };
  await cache.mutateRecords({ puts: [input] });
  await cache.getRecord('a');
  input.nested.value = 'changed';
  expect((await cache.getData())[0]).toEqual({ _id: 'a', nested: { value: 'original' } });
  expect(await cache.getRecord('a')).toEqual({ _id: 'a', nested: { value: 'original' } });
});

it('does not repopulate a cache cleared during an in-flight read', async () => {
  const { storage, cache } = await setup('lazy');
  let release!: (value: Map<string, any>) => void;
  let started!: () => void;
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  jest.spyOn(storage, 'getRecords').mockImplementationOnce(() => {
    started();
    return new Promise((resolve) => {
      release = resolve;
    });
  });
  const pending = cache.getRecord('a');
  await reading;
  cache.clearCache();
  release(new Map([['a', rows[0]]]));
  await pending;
  expect(cache.cacheStats().records).toBe(0);
});

it('does not admit a read snapshot if another handle commits while it is loading', async () => {
  const { storage, cache } = await setup('lazy');
  jest.spyOn(storage, 'getRecords').mockImplementationOnce(async () => {
    await storage.mutateRecords({ puts: [{ _id: 'a', value: 9 }] });
    return new Map([['a', rows[0]]]);
  });
  await cache.getRecord('a');
  expect(cache.cacheStats().records).toBe(0);
  expect(await cache.getRecord('a')).toEqual({ _id: 'a', value: 9 });
});

it('exposes isolated statistics and explicit clearing through the typed collection API', async () => {
  const db = new Cama({ persistenceAdapter: PersistenceAdapterEnum.InMemory, cache: { mode: 'lru' } });
  const collection = await db.initCollection<{ value: string }>('records', { columns: [], indexes: [] });
  await collection.insertOne({ _id: 'a', value: 'a' });
  await collection.findMany({ _id: 'a' });
  await collection.findMany({ _id: 'a' });
  expect(collection.cacheStats()).toMatchObject({ records: 1, hits: 1 });
  const stats = collection.cacheStats();
  stats.records = 99;
  expect(collection.cacheStats().records).toBe(1);
  collection.clearCache();
  expect(collection.cacheStats().records).toBe(0);
  await collection.destroy();
  expect(() => collection.cacheStats()).toThrow('destroyed');
});
