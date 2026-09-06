import { ICamaConfig } from '../../../../interfaces/cama-config.interface';
import { ILogger } from '../../../../interfaces/logger.interface';
import { PersistenceAdapterEnum } from '../../../../interfaces/perisistence-adapter.enum';
import { LEGACY_STORAGE_MESSAGE } from '../../storage-version';
import LocalstoragePersistence from '../localstorage-persistence';

describe('LocalstoragePersistence', () => {
  const logger: ILogger = { log: jest.fn(), startTimer: jest.fn(), endTimer: jest.fn() };
  const values = new Map<string, string>();
  const localStorage: Storage = {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };

  beforeAll(() => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage } });
  });
  beforeEach(() => localStorage.clear());
  afterAll(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('refuses a 2.x collection without modifying its data', async () => {
    const config: ICamaConfig = { path: 'legacy-database', persistenceAdapter: PersistenceAdapterEnum.LocalStorage };
    const key = 'legacy-database-people-data';
    const legacy = '[{"_id":"legacy-1","name":"Ada"}]';
    window.localStorage.setItem(key, legacy);

    const adapter = new LocalstoragePersistence(config, logger, 'people');
    await expect(adapter.getData()).rejects.toThrow(LEGACY_STORAGE_MESSAGE);
    expect(window.localStorage.getItem(key)).toBe(legacy);
  });
});
