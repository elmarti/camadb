import { ContainerModule, interfaces } from 'inversify';
import { TYPES } from '../../types';
import { IQueueService } from '../../interfaces/queue-service.interface';
import { QueueService } from './queue.service';


export default new ContainerModule((bind: interfaces.Bind, unbind: interfaces.Unbind) => {
  bind<IQueueService>(TYPES.QueueService).to(QueueService).inSingletonScope()
});
