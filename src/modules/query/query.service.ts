import { IQueryService } from '../../interfaces/query-service.interface';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../types';
import { IPersistenceAdapter } from '../../interfaces/persistence-adapter.interface';
import sift from "sift";
import { sort } from 'fast-sort';

import { IQueryOptions } from '../../interfaces/query-options.interface';
import { ILogger } from '../../interfaces/logger.interface';
import { IFilterResult } from '../../interfaces/filter-result.interface';
import { ICollectionMeta } from '../../interfaces/collection-meta.interface';
import { LogLevel } from '../../interfaces/logger-level.enum';
import LocalstoragePersistence from '../persistence/localstorage/localstorage-persistence';
import { ICollectionConfig } from '../../interfaces/collection-config.interface';
const obop = require('obop')();

@injectable()
export class QueryService<T> implements IQueryService<T>{

  private dateColumns = [];
  constructor(
    @inject(TYPES.CollectionMeta) private collectionMeta: ICollectionMeta,
    @inject(TYPES.PersistenceAdapter) private persistenceAdapter: IPersistenceAdapter,
              @inject(TYPES.Logger) private logger:ILogger,
              @inject(TYPES.CollectionConfig) private collectionConfig: ICollectionConfig) {

  }

 /**
   * Handle filtering of queries
   * @param query - The query to be applied to the dataset
   * @param options - Options for further data manipulation
   */
 async filter(query: any = {}, options: IQueryOptions = {}): Promise<IFilterResult<T>> {

  const filterResult:any = {};

  let data = await this.persistenceAdapter.getData();

  // Check if the persistenceAdapter is an instance of LocalstoragePersistence
  if (this.persistenceAdapter instanceof LocalstoragePersistence) {
    const indexedColumns = new Set(this.collectionConfig.indexes.map(index => index.column));

    // Check if the query keys have any indexed columns
    const queryKeys = Object.keys(query);
    const indexedQueryKeys = queryKeys.filter(key => indexedColumns.has(key));

    if (indexedQueryKeys.length > 0) {
      // Use the index to get the relevant rows
      const rowIndexes = new Set<number>();
      indexedQueryKeys.forEach(key => {
        const value = query[key];
        //@ts-ignore
        const indexMap = this.persistenceAdapter.getIndex(key);
        const rowIndex = indexMap.get(value);

        if (rowIndex !== undefined) {
          rowIndexes.add(rowIndex);
        }
      });

      // Filter the data using the rowIndexes
      data = Array.from(rowIndexes).map(index => data[index]);
    }
  }

  if (Object.keys(query).length > 0) {
    data = data.filter(sift(query));
  }
  filterResult['totalCount'] = data.length;
  if (options.sort) {
    data = sort(data).by(options.sort);
  }
  if (options.offset) {
    data = data.slice(options.offset, data.length);
  }
  if (options.limit) {
    data = data.slice(0, options.limit);
  }
  filterResult['count'] = data.length;
  filterResult['rows'] = data;
  return filterResult;
}

  async update(query: any, delta: any): Promise<void> {
    const data = await this.persistenceAdapter.getData();
    this.logger.log(LogLevel.Debug, "Iterating pages");
    const siftPointer = this.logger.startTimer();
    const updated = data.filter(sift(query));
    this.logger.endTimer(LogLevel.Debug, siftPointer, 'Sifting data');
    if(updated.length > 0) {
      this.logger.log(LogLevel.Debug, `Updating sifted`);
      const updatePointer = this.logger.startTimer();
      obop.update(updated, delta);
      this.logger.endTimer(LogLevel.Debug, updatePointer, 'Update sifted');
      await this.persistenceAdapter.update(data);
    }
  }

}