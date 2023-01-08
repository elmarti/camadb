import { IPersistenceAdapter } from '../../../interfaces/persistence-adapter.interface';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../../types';
import { ICollectionMeta } from '../../../interfaces/collection-meta.interface';
import { IFS } from '../../../interfaces/fs.interface';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';
import * as path from 'path';
import { ILogger } from '../../../interfaces/logger.interface';
import { LogLevel } from '../../../interfaces/logger-level.enum';
import { ISystem } from '../../../interfaces/system.interface';
import { IQueueService } from '../../../interfaces/queue-service.interface';


@injectable()
export default class FSPersistence implements IPersistenceAdapter {


  private cache: any = null;
  private readonly outputPath: string;
  constructor(
    @inject(TYPES.CamaConfig) private config: ICamaConfig,
    @inject(TYPES.CollectionMeta) private collectionMeta: ICollectionMeta,
    @inject(TYPES.FS) private fs: IFS,
    @inject(TYPES.Logger) private logger:ILogger,
    @inject(TYPES.CollectionName) private collectionName: string,
    @inject(TYPES.System) private system: ISystem,
    @inject(TYPES.QueueService) private queue: IQueueService
  ) {
    this.outputPath = system.getOutputPath();
    // const getDataTask = () => this.getData();
    // this.queue.add(getDataTask);
  }



  /**
   * Insert rows into pages via the persistence adapter
   * @param rows - The rows to be inserted
   */
  async insert<T>(rows: Array<any>): Promise<any> {
    const data = [...(await this.getData()), ...rows];
    await this.fs.writeData(this.outputPath, this.collectionName, data);
    await this.fs.commit(this.outputPath, this.collectionName);
    this.cache = data;
    
  }

  /**
   * Load the data from either the cache or the pages
   */
  async getData<T>(): Promise<any> {
    const meta = await this.collectionMeta.get();
    const dateColumns:any = [];
    // @ts-ignore
    if(meta.columns && meta.columns.length > 0){
      // @ts-ignore
      for(const col of meta.columns){
        if(['date', 'datetime'].indexOf(col.type) > -1){
          dateColumns.push(col.title);
        }
      }

    }
    this.logger.log(LogLevel.Info, "Loading data");
    if(this.cache){
      this.logger.log(LogLevel.Info, "Loading data from cache");
      return this.cache;
    }
    this.logger.log(LogLevel.Info, "Loading data from disk");

    const outputPath = path.join(this.system.getOutputPath(), this.collectionName, 'data');

    const data:any = await this.fs.readData(outputPath);

    this.cache = data.map((row:any) => {
      for(const dateColumn of dateColumns){
        row[dateColumn] = new Date(row[dateColumn]);
      }

      return row;
    });

    return this.cache;
  }
  async update(updated:any): Promise<void> {
      this.logger.log(LogLevel.Debug, `Writing file`);
      await this.fs.writeData(this.outputPath, this.collectionName, updated);
      this.cache = updated;
      
  }

  /**
   * Destroy the collection within the persistence adapter
   */
  async destroy(): Promise<void> {
    await this.fs.rmDir(this.outputPath, this.collectionName);
    this.cache = null;
  }

}
