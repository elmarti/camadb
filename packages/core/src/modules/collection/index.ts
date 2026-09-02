import { ICollection } from '../../interfaces/collection.interface';
import { ICollectionConfig } from '../../interfaces/collection-config.interface';
import { TYPES } from '../../types';
import { IPersistenceAdapter } from '../../interfaces/persistence-adapter.interface';
import { IQueryService } from '../../interfaces/query-service.interface';
import { IQueryOptions } from '../../interfaces/query-options.interface';
import { ILogger } from '../../interfaces/logger.interface';
import { LogLevel } from '../../interfaces/logger-level.enum';
import { IFilterResult } from '../../interfaces/filter-result.interface';

import { ICamaConfig } from '../../interfaces/cama-config.interface';
import { IAggregator } from '../../interfaces/aggregator.interface';
import { containerFactory } from '../../util/container.factory';
import { IQueueService } from '../../interfaces/queue-service.interface';
import { ServiceRegistry } from '../../util/service-registry';
import {
  AggregationPipeline,
  Document,
  DocumentId,
  Filter,
  InsertDocument,
  StoredDocument,
  Update,
} from '../../interfaces/document-types';
import {
  DeleteResult,
  InsertManyResult,
  InsertOneResult,
  UpdateResult,
} from '../../interfaces/mutation-result.interface';

export class Collection<TDocument extends object = Document> implements ICollection<TDocument> {
  public container: ServiceRegistry;
  private config?: ICollectionConfig;
  private name?: string;
  private logger: ILogger;
  private persistenceAdapter: IPersistenceAdapter;
  private queryService: IQueryService<StoredDocument<TDocument>>;
  public queue: IQueueService;
  private destroyed = false;
  private aggregator: IAggregator<StoredDocument<TDocument>>;

  constructor(collectionName: string, collectionConfig: ICollectionConfig, camaConfig: ICamaConfig) {
    this.container = containerFactory(collectionName, camaConfig, collectionConfig);
    this.logger = this.container.get<ILogger>(TYPES.Logger);
    this.persistenceAdapter = this.container.get<IPersistenceAdapter>(TYPES.PersistenceAdapter);
    this.queryService = this.container.get<IQueryService<StoredDocument<TDocument>>>(TYPES.QueryService);
    this.queue = this.container.get<IQueueService>(TYPES.QueueService);

    this.aggregator = this.container.get<IAggregator<StoredDocument<TDocument>>>(TYPES.Aggregator);
    this.logger.log(LogLevel.Debug, 'Initializing collection');
    this.name = collectionName;
    this.config = collectionConfig;
    this.logger.log(LogLevel.Debug, 'Initializing persistence adapter');
  }

  /**
   * Insert many values into collection
   * @param rows - The values to be inserted
   */
  async insertMany(rows: InsertDocument<TDocument>[]): Promise<InsertManyResult<DocumentId>> {
    this.checkDestroyed();
    return this.queue.add(async () => {
      this.checkDestroyed();
      this.logger.log(LogLevel.Debug, 'Inserting many');
      const pointer = this.logger.startTimer();
      const prepared = await this.prepareInsert(rows);
      await this.persistenceAdapter.insert(prepared);
      this.logger.endTimer(LogLevel.Debug, pointer, 'insert  rows');
      return {
        acknowledged: true,
        insertedCount: prepared.length,
        insertedIds: prepared.map((row) => row._id),
      };
    });
  }

  /**
   * Inserts 1 value into collection
   *
   * @remarks
   * Essentially syntactic sugar - internally calls the same function as `insertMany`
   * @param row
   */
  async insertOne(row: InsertDocument<TDocument>): Promise<InsertOneResult<DocumentId>> {
    this.checkDestroyed();
    return this.queue.add(async () => {
      this.checkDestroyed();
      this.logger.log(LogLevel.Debug, 'Inserting one');
      const pointer = this.logger.startTimer();
      const [prepared] = await this.prepareInsert([row]);
      await this.persistenceAdapter.insert([prepared]);
      this.logger.endTimer(LogLevel.Debug, pointer, 'insert row');
      return { acknowledged: true, insertedId: prepared._id };
    });
  }

  /**
   * Find many rows from the collection
   *
   * @remarks
   * Lazily loads collection into cache, subsequent calls are significantly faster
   *
   * @param query - Query Object
   * @param options - Query options
   */
  async findMany(
    query: Filter<StoredDocument<TDocument>> = {},
    options?: IQueryOptions<StoredDocument<TDocument>>,
  ): Promise<IFilterResult<StoredDocument<TDocument>>> {
    this.checkDestroyed();
    this.logger.log(LogLevel.Debug, 'Finding many');
    const pointer = this.logger.startTimer();
    const result = await this.queryService.filter(query, options);
    this.logger.endTimer(LogLevel.Debug, pointer, 'Finding many');
    return result;
  }

  /**
   * Update all matched rows
   * @param query
   * @param delta
   */
  async updateMany(
    query: Filter<StoredDocument<TDocument>>,
    delta: Update<Omit<TDocument, '_id'>>,
  ): Promise<UpdateResult<DocumentId>> {
    this.checkDestroyed();
    this.assertIdentityUnchanged(delta);
    return this.queue.add(async () => {
      this.checkDestroyed();
      this.logger.log(LogLevel.Debug, 'Updating many');
      const pointer = this.logger.startTimer();
      const result = await this.queryService.update(query, delta as Update<StoredDocument<TDocument>>);
      this.logger.endTimer(LogLevel.Debug, pointer, 'Updating many');
      return result;
    });
  }

  async deleteOne(query: Filter<StoredDocument<TDocument>>): Promise<DeleteResult> {
    this.checkDestroyed();
    return this.queue.add(async () => {
      this.checkDestroyed();
      return this.queryService.delete(query, 1);
    });
  }

  async deleteMany(query: Filter<StoredDocument<TDocument>>): Promise<DeleteResult> {
    this.checkDestroyed();
    return this.queue.add(async () => {
      this.checkDestroyed();
      return this.queryService.delete(query);
    });
  }

  async count(query: Filter<StoredDocument<TDocument>> = {}): Promise<number> {
    this.checkDestroyed();
    return this.queryService.count(query);
  }

  async upsert(
    query: Filter<StoredDocument<TDocument>>,
    document: InsertDocument<TDocument>,
  ): Promise<UpdateResult<DocumentId>> {
    this.checkDestroyed();
    return this.queue.add(async () => {
      this.checkDestroyed();
      const changes = { ...document };
      delete changes._id;
      const update = await this.queryService.update(query, { $set: changes } as Update<StoredDocument<TDocument>>);
      if (update.matchedCount > 0) {
        return update;
      }

      const [prepared] = await this.prepareInsert([document]);
      await this.persistenceAdapter.insert([prepared]);
      return {
        acknowledged: true,
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 1,
        upsertedId: prepared._id,
      };
    });
  }

  /**
   * Destroy the collection
   * @remarks After calling this, the collection instance becomes unusable
   */
  async destroy(): Promise<void> {
    await this.persistenceAdapter.destroy();
    this.destroyed = true;
  }

  private checkDestroyed() {
    if (this.destroyed) {
      throw new Error('Collection has been destroyed. Call Cama.initCollection to recreate');
    }
  }

  /**
   * Perform MongoDB style aggregations
   * @param pipeline
   */
  async aggregate<TResult extends object = StoredDocument<TDocument>>(
    pipeline: AggregationPipeline<StoredDocument<TDocument>>,
  ): Promise<TResult[]> {
    return this.aggregator.aggregate<TResult>(pipeline);
  }

  private async prepareInsert(rows: InsertDocument<TDocument>[]): Promise<StoredDocument<TDocument>[]> {
    const ids = new Set<unknown>();
    const providedIds = rows.map((row) => row._id).filter((id): id is string => typeof id === 'string');
    const existingRecords = this.persistenceAdapter.getRecords
      ? await this.persistenceAdapter.getRecords(providedIds)
      : undefined;
    if (!this.persistenceAdapter.getRecord) {
      const existing = (await this.persistenceAdapter.getData()) as Array<{ _id?: unknown }>;
      existing
        .map((row) => row._id)
        .filter((id) => id !== undefined)
        .forEach((id) => ids.add(id));
    }

    const prepared: StoredDocument<TDocument>[] = [];
    for (const row of rows) {
      let id = row._id;
      const generated = id === undefined;
      if (id === undefined) {
        do {
          id = this.generateId();
        } while (ids.has(id) || (this.persistenceAdapter.getRecord && (await this.persistenceAdapter.getRecord(id))));
      }
      const exists =
        existingRecords?.has(id) ||
        (generated && this.persistenceAdapter.getRecord ? Boolean(await this.persistenceAdapter.getRecord(id)) : false);
      if (ids.has(id) || exists) {
        throw new Error(`Duplicate _id "${String(id)}"`);
      }
      ids.add(id);
      prepared.push({ ...row, _id: id } as StoredDocument<TDocument>);
    }
    return prepared;
  }

  private generateId(): string {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  private assertIdentityUnchanged(delta: Update<Omit<TDocument, '_id'>>): void {
    const candidate = delta as Record<string, unknown>;
    const operatorValues = ['$set', '$unset', '$inc']
      .map((operator) => candidate[operator])
      .filter((value): value is Record<string, unknown> => typeof value === 'object' && value !== null);
    if ('_id' in candidate || operatorValues.some((value) => '_id' in value)) {
      throw new Error('Document _id cannot be updated');
    }
  }
}
