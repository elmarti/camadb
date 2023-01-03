import { IQueueService } from '../../interfaces/queue-service.interface';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../types';
import { IPersistenceAdapter } from '../../interfaces/persistence-adapter.interface';
import { ILogger } from '../../interfaces/logger.interface';
import { ICollectionMeta } from '../../interfaces/collection-meta.interface';
import PQueue from 'p-queue';


@injectable()
export class QueueService implements IQueueService {
  private queue = new PQueue({ concurrency: 1 });

  constructor() {

  }
  add(task:any): Promise<any> {
    return this.queue.add(task);
  }

}