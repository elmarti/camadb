import { IQueueService } from '../../interfaces/queue-service.interface';

export class QueueService implements IQueueService {
  public promise: Promise<void> = Promise.resolve();
  public tasks: Array<() => unknown> = [];

  add<T>(task: () => T | Promise<T>): Promise<T> {
    this.tasks.push(task);

    const result = this.promise.then(() => task());

    // Keep the queue usable after a rejected task while preserving the
    // rejection for that task's caller.
    this.promise = result.then(
      () => undefined,
      () => undefined,
    );

    return result.finally(() => {
      const index = this.tasks.indexOf(task);
      if (index >= 0) this.tasks.splice(index, 1);
    });
  }
}
