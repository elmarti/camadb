import { DocumentId } from './document-types';

export interface InsertOneResult<TId = DocumentId> {
  acknowledged: true;
  insertedId: TId;
}

export interface InsertManyResult<TId = DocumentId> {
  acknowledged: true;
  insertedCount: number;
  insertedIds: TId[];
}

export interface UpdateResult<TId = DocumentId> {
  acknowledged: true;
  matchedCount: number;
  modifiedCount: number;
  upsertedCount: number;
  upsertedId?: TId;
}

export interface DeleteResult {
  acknowledged: true;
  deletedCount: number;
}
