import { IPersistenceAdapter } from '../../../interfaces/persistence-adapter.interface';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../../types';
import { ICollectionMeta } from '../../../interfaces/collection-meta.interface';
import PQueue from 'p-queue';
import { IFS } from '../../../interfaces/fs.interface';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';
import * as path from 'path';
import { ILogger } from '../../../interfaces/logger.interface';
import { LogLevel } from '../../../interfaces/logger-level.enum';


@injectable()
export default class FSPersistence implements IPersistenceAdapter {


  queue = new PQueue({ concurrency: 1 });
  private cache: any = null;
  private readonly outputPath: string;
  constructor(
    @inject(TYPES.CamaConfig) private config: ICamaConfig,
    @inject(TYPES.CollectionMeta) private collectionMeta: ICollectionMeta,
    @inject(TYPES.FS) private fs: IFS,
    @inject(TYPES.Logger) private logger:ILogger,
    @inject(TYPES.CollectionName) private collectionName: string
  ) {
    this.outputPath = this.config.path || '.cama'
    this.queue.add(() => this.getData());
  }



  /**
   * Insert rows into pages via the persistence adapter
   * @param rows - The rows to be inserted
   */
  async insert<T>(rows: Array<any>): Promise<any> {
    return await this.queue.add(()=> (async (rows) => {
      const outputPath = path.join(process.cwd(), this.outputPath);
      const data = [...(await this.getData()), ...rows];
      await this.fs.writeData(outputPath, this.collectionName, data);
      await this.fs.commit(outputPath, this.collectionName);
      this.cache = data;
    })(rows));
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

    const outputPath = path.join(process.cwd(), this.outputPath , this.collectionName, 'data');

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
      await this.queue.add(() => (async (updated) => {
          this.logger.log(LogLevel.Debug, `Writing file`);
          await this.fs.writeData(this.outputPath, this.collectionName, updated);
          this.cache = updated;
      })(updated))
  }

  /**
   * Destroy the collection within the persistence adapter
   */
  async destroy(): Promise<void> {
    await this.fs.rmDir(this.outputPath, this.collectionName);
    this.cache = null;
  }

}
