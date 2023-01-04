
export interface IQueueService{
  promise: Promise<any>;
  add(task: any): any;
}