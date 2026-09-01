import { IQueryService } from '../interfaces/query-service.interface';
import { IQueryOptions } from '../interfaces/query-options.interface';
import { IFilterResult } from '../interfaces/filter-result.interface';

export class QueryServiceMock implements IQueryService<any>{
  filter(query: any, options: IQueryOptions): Promise<IFilterResult<any>> {
    return Promise.resolve({  } as any);
  }

  update(query: any, delta: any): Promise<any> {
    return Promise.resolve({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 });
  }

  delete(): Promise<any> {
    return Promise.resolve({ acknowledged: true, deletedCount: 0 });
  }

  count(): Promise<number> {
    return Promise.resolve(0);
  }

}
