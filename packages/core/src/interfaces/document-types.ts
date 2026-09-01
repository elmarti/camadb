export type Document = Record<string, unknown>;

export type DocumentId = string;

export type StoredDocument<TDocument extends object> = Omit<TDocument, '_id'> & {
  _id: DocumentId;
};

export type InsertDocument<TDocument extends object> = Omit<TDocument, '_id'> & {
  _id?: DocumentId;
};

type FieldOperator<T> = {
  $eq?: T;
  $ne?: T;
  $in?: readonly T[];
  $nin?: readonly T[];
  $exists?: boolean;
  $gt?: T;
  $gte?: T;
  $lt?: T;
  $lte?: T;
};

export type FieldFilter<T> = T | FieldOperator<T>;

export type Filter<TDocument extends object> = {
  [TKey in keyof TDocument]?: FieldFilter<TDocument[TKey]>;
} & {
  $and?: readonly Filter<TDocument>[];
  $or?: readonly Filter<TDocument>[];
  $nor?: readonly Filter<TDocument>[];
};

type NumericKey<TDocument extends object> = {
  [TKey in keyof TDocument]-?: TDocument[TKey] extends number ? TKey : never;
}[keyof TDocument];

export type Update<TDocument extends object> = Partial<TDocument> | {
  $set?: Partial<TDocument>;
  $unset?: Partial<Record<keyof TDocument, boolean | 1 | ''>>;
  $inc?: Partial<Record<NumericKey<TDocument>, number>>;
};

export type AggregationStage<TDocument extends object> =
  | { $match: Filter<TDocument> }
  | { $project: Partial<Record<keyof TDocument | string, boolean | 0 | 1 | unknown>> }
  | { $sort: Partial<Record<keyof TDocument, 1 | -1>> }
  | { $skip: number }
  | { $limit: number }
  | { $group: Record<string, unknown> }
  | { $unwind: keyof TDocument | `$${Extract<keyof TDocument, string>}` };

export type AggregationPipeline<TDocument extends object> = readonly AggregationStage<TDocument>[];
