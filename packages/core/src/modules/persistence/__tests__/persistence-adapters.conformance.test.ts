import { promises as nodeFs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';
import { ICollectionMeta } from '../../../interfaces/collection-meta.interface';
import { ILogger } from '../../../interfaces/logger.interface';
import { PersistenceAdapterEnum } from '../../../interfaces/perisistence-adapter.enum';
import { LoggerMock } from '../../../mocks/logger';
import { QueueService } from '../../queue/queue.service';
import { FlattedSerializer } from '../../serialization/flatted-serializer';
import { NodeSystem } from '../../system/node.system';
import FSPersistence from '../fs/fs-persistence';
import { Fs } from '../fs/fs';
import IndexedDbPersistence from '../indexeddb/indexeddb-persistence';
import InmemoryPersistence from '../inmemory/inmemory-persistence';
import LocalstoragePersistence from '../localstorage/localstorage-persistence';
import {
  PersistenceAdapterConformanceContext,
  persistenceAdapterConformance,
} from '../../../../test-utils/persistence-adapter.conformance';

const logger: ILogger = new LoggerMock();

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }
}

const config = (databasePath: string, persistenceAdapter: PersistenceAdapterEnum): ICamaConfig => ({
  path: databasePath,
  persistenceAdapter,
});

persistenceAdapterConformance('in-memory', {
  async createContext() {
    return {
      async createAdapter() {
        return new InmemoryPersistence();
      },
      async cleanup() {},
    };
  },
});

persistenceAdapterConformance('localStorage', {
  persistsAcrossInstances: true,
  async createContext() {
    const storage = new MemoryStorage();
    const databaseName = `conformance-${Date.now()}-${Math.random()}`;
    const previousWindow = (globalThis as { window?: unknown }).window;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { localStorage: storage },
    });

    return {
      async createAdapter(collectionName = 'primary') {
        return new LocalstoragePersistence(
          config(databaseName, PersistenceAdapterEnum.LocalStorage),
          logger,
          collectionName,
        );
      },
      async cleanup() {
        storage.clear();
        if (previousWindow === undefined) {
          delete (globalThis as { window?: unknown }).window;
        } else {
          Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: previousWindow,
          });
        }
      },
    };
  },
});

persistenceAdapterConformance('IndexedDB', {
  persistsAcrossInstances: true,
  serializesMutations: true,
  testsRejectedMutationRecovery: true,
  async createContext() {
    const databaseName = `conformance-${Date.now()}-${Math.random()}`;
    const adapters: IndexedDbPersistence[] = [];

    return {
      async createAdapter(collectionName = 'primary') {
        const adapter = new IndexedDbPersistence(
          config(databaseName, PersistenceAdapterEnum.IndexedDb),
          logger,
          collectionName,
        );
        adapters.push(adapter);
        return adapter;
      },
      createFailingMutation(adapter) {
        return adapter.update({ value: () => undefined });
      },
      async cleanup() {
        await Promise.allSettled(adapters.map((adapter) => adapter.destroy()));
      },
    };
  },
});

persistenceAdapterConformance('filesystem', {
  persistsAcrossInstances: true,
  serializesMutations: true,
  testsRejectedMutationRecovery: true,
  async createContext(): Promise<PersistenceAdapterConformanceContext> {
    const databasePath = await nodeFs.mkdtemp(path.join(tmpdir(), 'camadb-conformance-'));
    const camaConfig = config(databasePath, PersistenceAdapterEnum.FS);
    const system = new NodeSystem(camaConfig);
    const filesystem = new Fs(new FlattedSerializer(logger), logger);
    const queue = new QueueService();

    return {
      async createAdapter(collectionName = 'primary') {
        const collectionPath = path.join(databasePath, collectionName);
        if (!(await filesystem.exists(collectionPath))) {
          await filesystem.mkdir(collectionPath);
          await filesystem.writeData(databasePath, collectionName, []);
          await filesystem.commit(databasePath, collectionName);
        }

        const collectionMeta: ICollectionMeta = {
          async get() {
            return { collectionName, columns: [], indexes: [] };
          },
          async update() {},
        };

        const adapter = new FSPersistence(
          camaConfig,
          collectionMeta,
          filesystem,
          logger,
          collectionName,
          system,
          queue,
        );
        await adapter.getData();
        return adapter;
      },
      createFailingMutation(adapter) {
        jest.spyOn(nodeFs, 'rename').mockRejectedValueOnce(new Error('simulated interruption'));
        return adapter.insert([{ id: 'interrupted' }]);
      },
      async cleanup() {
        jest.restoreAllMocks();
        await nodeFs.rm(databasePath, { recursive: true, force: true });
      },
    };
  },
});
