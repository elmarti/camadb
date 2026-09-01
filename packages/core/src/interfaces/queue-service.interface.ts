
export interface IQueueService{
  promise: Promise<any>;
  add<T>(task: () => T | Promise<T>): Promise<T>;
}
