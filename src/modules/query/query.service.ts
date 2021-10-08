import { IQueryService } from '../../interfaces/query-service.interface';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../types';
import { IPersistenceAdapter } from '../../interfaces/persistence-adapter.interface';
import sift from "sift";
import { sort } from 'fast-sort';

import { IQueryOptions } from '../../interfaces/query-options.interface';

@injectable()
export class QueryService<T> implements IQueryService<T>{
  constructor(@inject(TYPES.PersistenceAdapter) private persistenceAdapter: IPersistenceAdapter) {
  }
  async filter(query: any = {}, options: IQueryOptions = {}): Promise<T> {
    let data = await this.persistenceAdapter.getData();

    if(Object.keys(query).length > 0){
      console.log({query});
      data = data.filter(sift(query));
    }
    if(options.sort){
      data = sort(data).by(options.sort)
    }
    return data;
  }


}