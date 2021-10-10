import { IPersistenceAdapter } from '../../../interfaces/persistence-adapter.interface';
import { ICollectionConfig } from '../../../interfaces/collection-config.interface';
import { inject } from 'inversify';
import { TYPES } from '../../../types';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';

import { ILogger } from '../../../interfaces/logger.interface';
import { IDBPDatabase, openDB } from 'idb';
import PQueue from 'p-queue';

export default class IndexedDbPersistence implements IPersistenceAdapter{
  private db?: IDBPDatabase;
  queue = new PQueue({ concurrency: 1 });
  private dbName? = "";
  private destroyed = false;
  private storeName = "";
  private cache: any;
  constructor(
    @inject(TYPES.CamaConfig) private config: ICamaConfig,
    @inject(TYPES.Logger) private logger:ILogger
  ) {

  }
  async destroy(): Promise<void> {
    this.db?.deleteObjectStore(this.storeName);
    this.destroyed = true;
  }
  update(updated:any): Promise<void> {
    return Promise.resolve(undefined);
  }
  async getData(): Promise<any> {
    if(this.cache){
      return this.cache
    }
    this.cache = await this.db?.getAll(this.storeName);
    return this.cache;
  }
  async insert(rows: Array<any>): Promise<any> {
    await this.queue.add(async () => {
      const tx = (this.db as any).transaction(this.storeName, 'readwrite');
      await Promise.all([...rows.map(row => tx.store.add(row)),
        tx.done]);
    });

  }
  async initCollection(name: string, config: ICollectionConfig): Promise<void> {
    this.dbName = this.config.path || 'cama';
    this.storeName = name;
    this.db = await openDB(this.dbName, 1, {
      upgrade(db: IDBPDatabase) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name);
          }
        }
      }
    );
  }

}
