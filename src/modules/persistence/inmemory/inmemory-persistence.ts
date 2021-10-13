import { IPersistenceAdapter } from '../../../interfaces/persistence-adapter.interface';
import { ICollectionConfig } from '../../../interfaces/collection-config.interface';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../../types';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';

import { ILogger } from '../../../interfaces/logger.interface';
import PQueue from 'p-queue';

@injectable()
export default class InmemoryPersistence implements IPersistenceAdapter{
  queue = new PQueue({ concurrency: 1 });
  private dbName? = "";
  private destroyed = false;
  private collectionName = "";
  private cache: any = [];
  constructor(
    @inject(TYPES.CamaConfig) private config: ICamaConfig,
    @inject(TYPES.Logger) private logger:ILogger
  ) {

  }
  async destroy(): Promise<void> {
    //@ts-ignore
    this.cache = null;
    this.destroyed = true;
  }
  async update(updated:any): Promise<void> {
    this.checkDestroyed();
    this.cache = updated;
  }
  async getData(): Promise<any> {
    this.checkDestroyed();
    return this.cache;
  }
  async insert(rows: Array<any>): Promise<any> {
    this.checkDestroyed();
    await this.queue.add(async () => {
      const data = await this.getData();
      data.push(...rows);
      this.cache = data;
    });

  }



  async initCollection(name: string, config: ICollectionConfig): Promise<void> {

  }
  private checkDestroyed(){
    if(this.destroyed){
      throw new Error('Collection has been destroyed. Call Cama.initCollection to recreate')
    }
  }
}
