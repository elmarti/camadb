import { IPersistenceAdapter } from '../../../interfaces/persistence-adapter.interface';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../../types';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';

import { ILogger } from '../../../interfaces/logger.interface';

@injectable()
export default class LocalstoragePersistence implements IPersistenceAdapter{
  private readonly dbName;
  private destroyed = false;
  private cache: any = null;
  constructor(
    @inject(TYPES.CamaConfig) private config: ICamaConfig,
    @inject(TYPES.Logger) private logger:ILogger,
    @inject(TYPES.CollectionName) private collectionName: string,
  ) {
    this.dbName = this.config.path || 'cama';
    this.getData();
  }
  async destroy(): Promise<void> {
    //@ts-ignore
    window.localStorage.removeItem(`${this.dbName}-${this.collectionName}-data`);
    this.destroyed = true;
  }
  async update(updated:any): Promise<void> {
    this.checkDestroyed();
    await this.setData(updated);
    //@ts-ignore
  }
  async getData(): Promise<any> {
    this.checkDestroyed();
      if(this.cache){
        return this.cache
      }
      this.cache = await this.loadData();

      return this.cache;

  }
  async insert(rows: Array<any>): Promise<any> {
    this.checkDestroyed();
      const data = await this.getData();
      data.push(...rows);
      await this.setData(data);

  }
  private async loadData(){
    //@ts-ignore
    const result = await window.localStorage.getItem(`${this.dbName}-${this.collectionName}-data`);
    if(!result){
      return [];
    }
    return JSON.parse(result);
  }

  private async setData(data:any){
    //@ts-ignore

    await window.localStorage.setItem(`${this.dbName}-${this.collectionName}-data`, JSON.stringify(data));

  }

  private checkDestroyed(){
    if(this.destroyed){
      throw new Error('Collection has been destroyed. Call Cama.initCollection to recreate')
    }
  }
}
