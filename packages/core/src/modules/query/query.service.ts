import { IQueryService } from '../../interfaces/query-service.interface';
import { TYPES } from '../../types';
import { IPersistenceAdapter } from '../../interfaces/persistence-adapter.interface';
import sift from 'sift';
import { sort } from 'fast-sort';

import { IQueryOptions } from '../../interfaces/query-options.interface';
import { ILogger } from '../../interfaces/logger.interface';
import { IFilterResult } from '../../interfaces/filter-result.interface';
import { ICollectionMeta } from '../../interfaces/collection-meta.interface';
import { LogLevel } from '../../interfaces/logger-level.enum';
import { Filter, Update } from '../../interfaces/document-types';
import { DeleteResult, UpdateResult } from '../../interfaces/mutation-result.interface';

export class QueryService<T extends object> implements IQueryService<T> {
  private dateColumns = [];
  constructor(
    private collectionMeta: ICollectionMeta,
    private persistenceAdapter: IPersistenceAdapter,
    private logger: ILogger,
  ) {}

  /**
   * Handle filtering of queries
   * @param query - The query to be applied to the dataset
   * @param options - Options for further data manipulation
   */
  async filter(query: Filter<T> = {}, options: IQueryOptions<T> = {}): Promise<IFilterResult<T>> {
    const filterResult: any = {};
    const identity = this.identityQuery(query);
    let data =
      identity !== undefined && this.persistenceAdapter.getRecord
        ? [await this.persistenceAdapter.getRecord(identity)].filter((row): row is T => row !== undefined)
        : ((await this.persistenceAdapter.getData()) as T[]);
    if (Object.keys(query).length > 0) {
      data = data.filter(sift(query as any));
    }
    filterResult['totalCount'] = data.length;
    if (options.sort) {
      data = sort(data).by(options.sort);
    }
    if (options.offset) {
      data = data.slice(options.offset, data.length);
    }
    if (options.limit) {
      data = data.slice(0, options.limit);
    }
    filterResult['count'] = data.length;
    filterResult['rows'] = data;
    return filterResult;
  }

  async update(query: Filter<T>, delta: Update<T>): Promise<UpdateResult> {
    const identity = this.identityQuery(query);
    if (identity !== undefined && this.persistenceAdapter.getRecord && this.persistenceAdapter.mutateRecords) {
      const row = (await this.persistenceAdapter.getRecord(identity)) as T | undefined;
      if (!row || !sift(query as any)(row)) return this.updateResult(0);
      this.applyUpdate(row, delta);
      await this.persistenceAdapter.mutateRecords({ puts: [row] });
      return this.updateResult(1);
    }
    const data = (await this.persistenceAdapter.getData()) as T[];
    this.logger.log(LogLevel.Debug, 'Iterating pages');
    const siftPointer = this.logger.startTimer();
    const updated = data.filter(sift(query as any));
    this.logger.endTimer(LogLevel.Debug, siftPointer, 'Sifting data');
    if (updated.length > 0) {
      this.logger.log(LogLevel.Debug, `Updating sifted`);
      const updatePointer = this.logger.startTimer();
      updated.forEach((row) => this.applyUpdate(row, delta));
      this.logger.endTimer(LogLevel.Debug, updatePointer, 'Update sifted');
      await this.persistenceAdapter.update(data);
    }
    return this.updateResult(updated.length);
  }

  async delete(query: Filter<T>, limit?: number): Promise<DeleteResult> {
    const identity = this.identityQuery(query);
    if (identity !== undefined && this.persistenceAdapter.getRecord && this.persistenceAdapter.mutateRecords) {
      const row = (await this.persistenceAdapter.getRecord(identity)) as T | undefined;
      if (!row || !sift(query as any)(row)) return { acknowledged: true, deletedCount: 0 };
      await this.persistenceAdapter.mutateRecords({ deletes: [identity] });
      return { acknowledged: true, deletedCount: 1 };
    }
    const data = (await this.persistenceAdapter.getData()) as T[];
    const matches = data.filter(sift(query as any));
    const toDelete = limit === undefined ? matches : matches.slice(0, limit);
    const deleted = new Set(toDelete);

    if (deleted.size > 0) {
      await this.persistenceAdapter.update(data.filter((row) => !deleted.has(row)));
    }

    return { acknowledged: true, deletedCount: deleted.size };
  }

  async count(query: Filter<T> = {}): Promise<number> {
    const identity = this.identityQuery(query);
    if (identity !== undefined && this.persistenceAdapter.getRecord) {
      const row = (await this.persistenceAdapter.getRecord(identity)) as T | undefined;
      return row && sift(query as any)(row) ? 1 : 0;
    }
    const data = (await this.persistenceAdapter.getData()) as T[];
    if (Object.keys(query).length === 0) return data.length;
    return data.filter(sift(query as any)).length;
  }

  private applyUpdate(row: T, delta: Update<T>): void {
    const update = delta as Record<string, unknown>;
    const hasOperators = Object.keys(update).some((key) => key.startsWith('$'));
    if (!hasOperators) {
      Object.assign(row, update);
      return;
    }

    const set = update.$set as Record<string, unknown> | undefined;
    if (set) Object.assign(row, set);

    const unset = update.$unset as Record<string, unknown> | undefined;
    if (unset) Object.keys(unset).forEach((key) => delete (row as Record<string, unknown>)[key]);

    const increment = update.$inc as Record<string, number> | undefined;
    if (increment) {
      Object.entries(increment).forEach(([key, amount]) => {
        const current = Number((row as Record<string, unknown>)[key] ?? 0);
        (row as Record<string, unknown>)[key] = current + amount;
      });
    }
  }

  private identityQuery(query: Filter<T>): string | undefined {
    const entries = Object.entries(query as Record<string, unknown>);
    return entries.length === 1 && entries[0][0] === '_id' && typeof entries[0][1] === 'string'
      ? entries[0][1]
      : undefined;
  }

  private updateResult(count: number): UpdateResult {
    return {
      acknowledged: true,
      matchedCount: count,
      modifiedCount: count,
      upsertedCount: 0,
    };
  }
}
