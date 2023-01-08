import { IQueueService } from '../../interfaces/queue-service.interface';
import { injectable } from 'inversify';

@injectable()
export class QueueService implements IQueueService {
  public promise = Promise.resolve();
  public tasks:any = [];
  constructor() {
  }
  add(task:any): Promise<any> {
    // return this.queue.add(task);
    return new Promise((resolve, reject) => {
      this.tasks.push(task);
      this.promise = this.promise
        .then(async () => task())
        .then((result) => {
          this.tasks.shift();
          resolve(result);
        }, reject);
    });
  }

}