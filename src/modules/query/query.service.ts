import { IQueryService } from '../../interfaces/query-service.interface';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../types';
import { IPersistenceAdapter } from '../../interfaces/persistence-adapter.interface';
import sift from "sift";
import { sort } from 'fast-sort';

import { IQueryOptions } from '../../interfaces/query-options.interface';
import { ILogger } from '../../interfaces/logger.interface';
import { IFilterResult } from '../../interfaces/filter-result.interface';

@injectable()
export class QueryService<T> implements IQueryService<T>{

  constructor(@inject(TYPES.PersistenceAdapter) private persistenceAdapter: IPersistenceAdapter,
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
    const data = await this.persistenceAdapter.getData();
    let rows = [];
    for(const key in data){
      rows.push(...data[key]);
    }
    if(Object.keys(query).length > 0){
      console.log({query});
      rows = rows.filter(sift(query));
    }
    filterResult['totalCount'] = rows.length;
    if(options.sort){
      rows = sort(rows).by(options.sort)
    }
    if(options.offset){
      rows = rows.slice(options.offset, data.length);
    }
    if(options.limit){
      rows = rows.slice(0, options.limit);
    }
    filterResult['count'] = rows.length;

    filterResult['rows'] = rows.map((d:any) => {
      delete d.$$camaMeta;
      return d;
    });
    return  filterResult;
  }
  async retrieveIndexes(query: any): Promise<any> {
    const data = await this.persistenceAdapter.getData();
    const metas = [];
    let foundPage = null;
    let foundIndex = null;
    for(const page in  data){
      const index = data[page].findIndex(sift(query));
      if(index !== -1){
        foundPage = page;
        foundIndex = index;
        break;
      }
    }
    return {
      foundPage,
      foundIndex
    };
  }

}