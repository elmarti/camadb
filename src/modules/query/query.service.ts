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
const obop = require('obop')();

@injectable()
export class QueryService<T> implements IQueryService<T>{

  private dateColumns = [];
  constructor(
    @inject(TYPES.CollectionMeta) private collectionMeta: ICollectionMeta,
    @inject(TYPES.PersistenceAdapter) private persistenceAdapter: IPersistenceAdapter,
              @inject(TYPES.Logger) private logger:ILogger) {

  }

  /**
   * Handle filtering of queries
   * @param query - The query to be applied to the dataset
   * @param options - Options for further data manipulation
   */
  async filter(query: any = {}, options: IQueryOptions = {}): Promise<IFilterResult<T>> {

    const filterResult:any = {

    };
    let data = await this.persistenceAdapter.getData();
    if(Object.keys(query).length > 0){
      data = data.filter(sift(query));
    }
    filterResult['totalCount'] = data.length;
    if(options.sort){
      data = sort(data).by(options.sort)
    }
    if(options.offset){
      data = data.slice(options.offset, data.length);
    }
    if(options.limit){
      data = data.slice(0, options.limit);
    }
    filterResult['count'] = data.length;
    filterResult['rows'] = data;
    return  filterResult;
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