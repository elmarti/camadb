import { ICama } from './interfaces/cama.interface';
import { ICollectionConfig } from './interfaces/collection-config.interface';
import { ICamaConfig } from './interfaces/cama-config.interface';
import { ICollection } from './interfaces/collection.interface';
import { Collection } from './modules/collection';

import 'reflect-metadata';


export class Cama implements ICama {
  private camaConfig: ICamaConfig;

  constructor(camaConfig: ICamaConfig) {
    this.camaConfig = camaConfig;

  }



  /**
   * Initializes a collection with the appropriate persistence adapter
   *
   * @remarks
   * Initialises collection metadata if non-existent, else loads it
   *
   * @param collectionName - the collection name
   * @param config - The collection configuration
   * @returns an initialised collection
   */
  async initCollection<T>(collectionName: string, config: ICollectionConfig): Promise<ICollection> {
    return new Collection(collectionName, config, this.camaConfig);
  }
}

export {
  Collection
}