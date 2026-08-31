import { IDBPDatabase, openDB as openDatabase } from 'idb';

interface DatabaseState {
  db?: IDBPDatabase;
  queue: Promise<void>;
}

/** Serializes schema changes and database access for every database name. */
export class IndexedDbDatabaseCoordinator {
  private static states = new Map<string, DatabaseState>();

  private static state(databaseName: string): DatabaseState {
    let state = this.states.get(databaseName);
    if (!state) {
      state = { queue: Promise.resolve() };
      this.states.set(databaseName, state);
    }
    return state;
  }

  private static enqueue<T>(databaseName: string, operation: (state: DatabaseState) => Promise<T>): Promise<T> {
    const state = this.state(databaseName);
    const result = state.queue.then(() => operation(state));
    state.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  static ensureStore(databaseName: string, storeName: string): Promise<void> {
    return this.enqueue(databaseName, async state => {
      if (!state.db) {
        state.db = await openDatabase(databaseName, undefined, {
          upgrade: db => {
            if (!db.objectStoreNames.contains(storeName)) {
              db.createObjectStore(storeName).put([], 'data');
            }
          }
        });
      }

      if (state.db.objectStoreNames.contains(storeName)) return;

      const nextVersion = state.db.version + 1;
      state.db.close();
      state.db = undefined;
      state.db = await openDatabase(databaseName, nextVersion, {
        upgrade: db => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName).put([], 'data');
          }
        }
      });
    });
  }

  static run<T>(databaseName: string, operation: (db: IDBPDatabase) => Promise<T>): Promise<T> {
    return this.enqueue(databaseName, async state => {
      if (!state.db) state.db = await openDatabase(databaseName);
      return operation(state.db);
    });
  }

  static deleteStore(databaseName: string, storeName: string): Promise<void> {
    return this.enqueue(databaseName, async state => {
      if (!state.db) state.db = await openDatabase(databaseName);
      if (!state.db.objectStoreNames.contains(storeName)) return;

      const nextVersion = state.db.version + 1;
      state.db.close();
      state.db = undefined;
      state.db = await openDatabase(databaseName, nextVersion, {
        upgrade: db => db.deleteObjectStore(storeName)
      });
    });
  }
}
