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
  private meta:any;
  constructor() {}

  /**
   * Initialise the collection meta
   * @private
   * @remarks Internal method - don't call it
   * @param collectionName - The name of the collection
   * @param config - The collection config
   */
  async init(collectionName: string, config: ICollectionConfig): Promise<void> {
    return Promise.resolve();
     }

  /**
   * Update the meta value
   * @param collectionName - the name of the collection
   * @param metaStructure - the value to be to be applied to the meta
   */
  async update(collectionName: string, metaStructure: IMetaStructure): Promise<void> {

    return Promise.resolve();

  }

  /**
   * Gets the in-memory meta value
   */
  async get(): Promise<IMetaStructure|undefined> {
    return this.meta;
  }
}