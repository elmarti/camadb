import { CollectionMeta } from '../collection-meta';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('localStorage collection metadata', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { localStorage: new MemoryStorage() },
    });
  });

  it('persists index definitions across collection instances', async () => {
    const first = new CollectionMeta(
      { persistenceAdapter: 'localstorage', path: 'metadata-test' },
      { columns: [], indexes: ['group'], searchIndexes: ['body'] },
      'records',
    );
    await expect(first.get()).resolves.toMatchObject({ indexes: ['group'], searchIndexes: ['body'] });

    const reopened = new CollectionMeta(
      { persistenceAdapter: 'localstorage', path: 'metadata-test' },
      { columns: [], indexes: ['ignored'], searchIndexes: ['ignored'] },
      'records',
    );
    await expect(reopened.get()).resolves.toMatchObject({ indexes: ['group'], searchIndexes: ['body'] });
  });
});
