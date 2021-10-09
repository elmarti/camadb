import { inject, injectable } from 'inversify';
import * as path from 'path';
import PQueue from 'p-queue';
import { TYPES } from '../../../types';
import { IFS } from '../../../interfaces/fs.interface';
import { ICollectionMeta } from '../../../interfaces/collection-meta.interface';
import { ICollectionConfig } from '../../../interfaces/collection-config.interface';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';
import { IMetaStructure } from '../../../interfaces/meta-structure.interface';
import { ILogger } from '../../../interfaces/logger.interface';
import { LogLevel } from '../../../interfaces/logger-level.enum';

@injectable()
export class CollectionMeta implements ICollectionMeta {
  queue = new PQueue({ concurrency: 1 });
  private meta?: IMetaStructure;
  private dbPath?: string;
  private fileName?: string;
  private collectionName?: string;
  private camaPath?: string;
  constructor(@inject(TYPES.FS) private fs: IFS, @inject(TYPES.CamaConfig) private config: ICamaConfig,
              @inject(TYPES.Logger) private logger:ILogger) {}

  /**
   * Initialise the collection meta
   * @private
   * @remarks Internal method - don't call it
   * @param collectionName - The name of the collection
   * @param config - The collection config
   */
  async init(collectionName: string, config: ICollectionConfig): Promise<void> {
    this.camaPath =  path.join(process.cwd(), './.cama');
    this.dbPath = path.join(this.camaPath, collectionName);
    this.fileName = `meta.json`;
    this.collectionName = collectionName;
    this.logger.log(LogLevel.Info, 'Ensuring cama folder exists: ' + this.camaPath);
    if ((!await this.fs.exists(this.camaPath))) {
      this.logger.log(LogLevel.Info, "Doesn't exist, creating: " + this.camaPath);

      await this.fs.mkdir(path.join(this.camaPath));
    }
    this.logger.log(LogLevel.Info, 'Checking if folder exists for collection' + this.fileName);

    if (await this.fs.exists(path.join(this.dbPath, this.fileName))) {
      this.logger.log(LogLevel.Info, 'Already exists');
      return;
    }
    this.logger.log(LogLevel.Info, 'Does not exist, creating' + this.fileName);

    await this.fs.mkdir(path.join(this.dbPath));
    this.meta = {
      ...config,
      collectionName,
    };
    this.logger.log(LogLevel.Info, 'Writing meta file');

    return this.fs.writeJSON<IMetaStructure>(this.dbPath, this.fileName, this.meta);
  }

  /**
   * Update the meta value
   * @param collectionName - the name of the collection
   * @param metaStructure - the value to be to be applied to the meta
   */
  async update(collectionName: string, metaStructure: IMetaStructure): Promise<void> {

    this.logger.log(LogLevel.Info, 'Updating meta file');

    const dbPath = this.config.path || path.join(process.cwd(), './.cama', collectionName);
    this.meta = metaStructure;
    await this.queue.add(() => {
      this.meta = Object.assign({}, this.meta, metaStructure);
      this.logger.log(LogLevel.Info, 'Writing meta file');
      return this.fs.writeJSON<IMetaStructure>(dbPath, 'meta.json', this.meta);
    });
  }

  /**
   * Gets the in-memory meta value
   */
  async get(): Promise<IMetaStructure|undefined> {
    this.logger.log(LogLevel.Info, 'Getting data from cache');
    return this.meta;
  }
}
