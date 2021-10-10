
export interface IAggregator {
  aggregate(pipeline:Array<any>): Promise<any>;
}