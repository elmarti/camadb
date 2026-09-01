import { IDBPDatabase, openDB as openDatabase } from 'idb';

interface DatabaseState {
  db?: IDBPDatabase;
  queue: Promise<void>;
}

/** Serializes schema changes and database access for every database name. */
export class IndexedDbDatabaseCoordinator {
  private static states = new Map<string, DatabaseState>();

  private static open(
    databaseName: string,
    state: DatabaseState,
    version?: number,
    upgrade?: (db: IDBPDatabase) => void
  ): Promise<IDBPDatabase> {
    let connection: IDBPDatabase | undefined;
    let upgradeWasBlocked = false;
    let rejectBlocked: (error: Error) => void = () => undefined;
    const blocked = new Promise<never>((_, reject) => {
      rejectBlocked = reject;
    });
    const opening = openDatabase(databaseName, version, {
      blocked: () => {
        upgradeWasBlocked = true;
        const error = new Error(`A schema upgrade for database "${databaseName}" is blocked by another connection`);
        error.name = 'BlockedError';
        rejectBlocked(error);
      },
      blocking: () => {
        connection?.close();
        if (state.db === connection) state.db = undefined;
      },
      upgrade: (db, _oldVersion, _newVersion, transaction) => {
        if (upgradeWasBlocked) {
          void transaction.done.catch(() => undefined);
          transaction.abort();
          return;
        }
        upgrade?.(db);
      }
    });
    opening.then(
      db => {
        connection = db;
        if (upgradeWasBlocked) db.close();
      },
      () => undefined
    );
    return Promise.race([opening, blocked]);
  }

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
        state.db = await this.open(databaseName, state, undefined, db => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName).put([], 'data');
          }
        });
      }

      if (state.db.objectStoreNames.contains(storeName)) return;

      const nextVersion = state.db.version + 1;
      state.db.close();
      state.db = undefined;
      state.db = await this.open(databaseName, state, nextVersion, db => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName).put([], 'data');
        }
      });
    });
  }

  static run<T>(databaseName: string, operation: (db: IDBPDatabase) => Promise<T>): Promise<T> {
    return this.enqueue(databaseName, async state => {
      if (!state.db) state.db = await this.open(databaseName, state);
      return operation(state.db);
    });
  }

  static deleteStore(databaseName: string, storeName: string): Promise<void> {
    return this.enqueue(databaseName, async state => {
      if (!state.db) state.db = await this.open(databaseName, state);
      if (!state.db.objectStoreNames.contains(storeName)) return;

      const nextVersion = state.db.version + 1;
      state.db.close();
      state.db = undefined;
      state.db = await this.open(databaseName, state, nextVersion, db => db.deleteObjectStore(storeName));
    });
  }
}
