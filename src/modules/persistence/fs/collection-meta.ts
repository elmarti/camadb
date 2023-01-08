import { inject, injectable } from 'inversify';
import * as path from 'path';
import { TYPES } from '../../../types';
import { IFS } from '../../../interfaces/fs.interface';
import { ICollectionMeta } from '../../../interfaces/collection-meta.interface';
import { ICollectionConfig } from '../../../interfaces/collection-config.interface';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';
import { IMetaStructure } from '../../../interfaces/meta-structure.interface';
import { ILogger } from '../../../interfaces/logger.interface';
import { LogLevel } from '../../../interfaces/logger-level.enum';
import { ISystem } from '../../../interfaces/system.interface';
import { IQueueService } from '../../../interfaces/queue-service.interface';

@injectable()
export class CollectionMeta implements ICollectionMeta {
  private meta?: IMetaStructure;
  private dbPath?: string;
  private fileName?: string;
  private camaPath?: string;
  constructor(@inject(TYPES.FS) private fs: IFS,
              @inject(TYPES.CamaConfig) private config: ICamaConfig,
              @inject(TYPES.CollectionConfig) private collectionConfig: ICollectionConfig,
              @inject(TYPES.CollectionName) private collectionName: string,
              @inject(TYPES.Logger) private logger:ILogger,
              @inject(TYPES.System) private system: ISystem,
              @inject(TYPES.QueueService) private queue: IQueueService) {
                const initializeCollectionMetaTask = async () => {
                  this.camaPath =  this.system.getOutputPath();
                  this.dbPath = path.join(this.system.getOutputPath(), collectionName);
                  this.fileName = `meta.json`;
                  this.collectionName = collectionName;
                  this.logger.log(LogLevel.Info, 'Ensuring cama folder exists: ' + this.camaPath);
                  if (!(await this.fs.exists(this.camaPath))) {
                    this.logger.log(LogLevel.Info, "Doesn't exist, creating: " + this.camaPath);
            
                    await this.fs.mkdir(path.join(this.camaPath));
                  }
                  this.logger.log(LogLevel.Info, 'Checking if folder exists for collection ' + this.fileName);
            
                  if (await this.fs.exists(path.join(this.dbPath, this.fileName))) {
                    this.logger.log(LogLevel.Info, 'Already exists');
                    return;
                  }
                  this.logger.log(LogLevel.Info, 'Does not exist, creating' + this.fileName);
            
                  await this.fs.mkdir(this.dbPath);
                  this.meta = {
                    ...collectionConfig,
                    collectionName,
                  };
                  this.logger.log(LogLevel.Info, 'Initialising empty collection');
                  await this.fs.writeData(this.camaPath, this.collectionName, []);
                  await this.fs.commit(this.camaPath, this.collectionName);
                  this.logger.log(LogLevel.Info, 'Writing meta file');
                  return await this.fs.writeJSON<IMetaStructure>(this.dbPath, this.fileName, this.meta);
                };
    this.queue.add(initializeCollectionMetaTask);
  }

  /**
   * Update the meta value
   * @param collectionName - the name of the collection
   * @param metaStructure - the value to be to be applied to the meta
   */
  async update(collectionName: string, metaStructure: IMetaStructure): Promise<void> {
    const updateCollectionMetaTask = () => {

      this.logger.log(LogLevel.Info, 'Updating meta file');

      const dbPath = this.config.path || path.join(process.cwd(), './.cama', collectionName);
      this.meta = metaStructure;
      this.meta = Object.assign({}, this.meta, metaStructure);
      this.logger.log(LogLevel.Info, 'Writing meta file');
      return this.fs.writeJSON<IMetaStructure>(dbPath, 'meta.json', this.meta);
    };
    await this.queue.add(updateCollectionMetaTask);
  }

  /**
   * Gets the in-memory meta value
   */
  async get(): Promise<IMetaStructure|undefined> {
    const getCollectionMetaTask = () => {
      this.logger.log(LogLevel.Info, 'Getting data from cache');
      return this.meta;
    };
    return await this.queue.add(getCollectionMetaTask);

  }
}
