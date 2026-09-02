import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { Cama, ICamaConfig, PersistenceAdapterEnum } from '../../../index';
import { shouldCompact } from '../compaction';

class MemoryStorage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe.each([PersistenceAdapterEnum.FS, PersistenceAdapterEnum.IndexedDb, PersistenceAdapterEnum.LocalStorage])(
  '%s automatic compaction',
  (adapter) => {
    let directory: string;
    let previousWindow: PropertyDescriptor | undefined;

    beforeEach(async () => {
      directory = await fs.mkdtemp(path.join(tmpdir(), 'camadb-compaction-'));
      previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
      if (adapter === PersistenceAdapterEnum.LocalStorage) {
        Object.defineProperty(globalThis, 'window', {
          configurable: true,
          value: { localStorage: new MemoryStorage() },
        });
      }
    });

    afterEach(async () => {
      if (adapter === PersistenceAdapterEnum.LocalStorage) {
        if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
        else delete (globalThis as { window?: unknown }).window;
      }
      await fs.rm(directory, { recursive: true, force: true });
    });

    it('reclaims repeated insert/update/delete churn without caller maintenance', async () => {
      const db = new Cama({
        path: directory,
        persistenceAdapter: adapter,
        compaction: { minReclaimableBytes: 0, minReclaimableRatio: 0 },
      });
      const collection = await db.initCollection<{ value: string }>('records', { columns: [], indexes: [] });
      try {
        for (let cycle = 0; cycle < 8; cycle += 1) {
          const id = `record-${cycle}`;
          await collection.insertOne({ _id: id, value: 'before' });
          await collection.updateMany({ _id: id }, { $set: { value: 'after' } });
          await collection.deleteOne({ _id: id });
          const stats = await collection.storageStats();
          expect(stats.reclaimableBytes).toBe(0);
          expect(stats.tombstones).toBe(0);
          expect(stats.lastCompactionError).toBeUndefined();
          expect(stats.totalBytes).toBeLessThan(2048);
        }
      } finally {
        await collection.destroy();
      }
    });

    it('supports explicit public maintenance below the automatic threshold', async () => {
      const db = new Cama({ path: directory, persistenceAdapter: adapter });
      const collection = await db.initCollection<{ value: string }>('records', { columns: [], indexes: [] });
      try {
        await collection.insertOne({ _id: 'record', value: 'before' });
        await collection.deleteOne({ _id: 'record' });
        expect((await collection.storageStats()).reclaimableBytes).toBeGreaterThan(0);
        await collection.compact();
        expect((await collection.storageStats()).reclaimableBytes).toBe(0);
        expect(await collection.count()).toBe(0);
      } finally {
        await collection.destroy();
      }
    });
  },
);

it('requires both the default 16 MiB and 25% thresholds', () => {
  const config: ICamaConfig = { persistenceAdapter: PersistenceAdapterEnum.InMemory };
  const stats = {
    generation: 1,
    liveBytes: 0,
    reclaimableBytes: 16 * 1024 * 1024,
    totalBytes: 64 * 1024 * 1024,
    tombstones: 1,
  };
  expect(shouldCompact(stats, config)).toBe(true);
  expect(shouldCompact({ ...stats, reclaimableBytes: stats.reclaimableBytes - 1 }, config)).toBe(false);
  expect(shouldCompact({ ...stats, totalBytes: stats.totalBytes + 1 }, config)).toBe(false);
});
