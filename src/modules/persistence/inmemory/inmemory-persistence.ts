import { IPersistenceAdapter } from '../../../interfaces/persistence-adapter.interface';
import { injectable } from 'inversify';


@injectable()
export default class InmemoryPersistence implements IPersistenceAdapter{
  private dbName? = "";
  private destroyed = false;
  private collectionName = "";
  private cache: any = [];
  
  async destroy(): Promise<void> {
    this.cache = null;
    this.destroyed = true;
  }
  async update(updated:any): Promise<void> {
    this.checkDestroyed();
    this.cache = updated;
  }
  async getData(): Promise<any> {
    this.checkDestroyed();
    return this.cache
  }
  async insert(rows: Array<any>): Promise<any> {
    this.checkDestroyed();
      const data = await this.getData();
      data.push(...rows);
      this.cache = data;

  }


  private checkDestroyed(){
    if(this.destroyed){
      throw new Error('Collection has been destroyed. Call Cama.initCollection to recreate')
    }
  }
}
