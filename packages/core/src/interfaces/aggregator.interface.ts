
import { AggregationPipeline, Document } from './document-types';

export interface IAggregator<TDocument extends object = Document> {
  aggregate<TResult extends object = TDocument>(pipeline: AggregationPipeline<TDocument>): Promise<TResult[]>;
}
