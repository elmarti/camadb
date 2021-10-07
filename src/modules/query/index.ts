import { ContainerModule, interfaces } from 'inversify';
import { TYPES } from '../../types';
import { IQueryService } from '../../interfaces/query-service.interface';
import { QueryService } from './query.service';


export default new ContainerModule((bind: interfaces.Bind, unbind: interfaces.Unbind) => {
  bind<IQueryService<any>>(TYPES.QueryService).to(QueryService).inSingletonScope()
});
