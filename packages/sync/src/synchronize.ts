import { ApplyMutationResult, SyncMutation } from './protocol';

export interface MutationSource<TDocument extends object> {
  mutations(
    cursor: number,
    limit: number,
  ): {
    mutations: SyncMutation<TDocument>[];
    nextCursor: number;
  };
}

export interface MutationTarget<TDocument extends object> {
  apply(mutation: SyncMutation<TDocument>): ApplyMutationResult<TDocument>;
}

export interface SynchronizeOptions<TDocument extends object> {
  batchSize?: number;
  cursor?: number;
  beforeApply?: (mutation: SyncMutation<TDocument>, cursor: number) => void | Promise<void>;
}

export interface SynchronizeResult<TDocument extends object> {
  applied: number;
  conflicts: number;
  cursor: number;
  duplicates: number;
  results: ApplyMutationResult<TDocument>[];
}

export class SyncInterruptedError<TDocument extends object> extends Error {
  constructor(
    readonly cursor: number,
    readonly partial: SynchronizeResult<TDocument>,
    readonly cause: unknown,
  ) {
    super(`Synchronization interrupted after cursor ${cursor}`);
    this.name = 'SyncInterruptedError';
  }
}

export const synchronize = async <TDocument extends object>(
  source: MutationSource<TDocument>,
  target: MutationTarget<TDocument>,
  options: SynchronizeOptions<TDocument> = {},
): Promise<SynchronizeResult<TDocument>> => {
  const batchSize = options.batchSize ?? 100;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new Error('Batch size must be a positive integer');
  let cursor = options.cursor ?? 0;
  const result: SynchronizeResult<TDocument> = { applied: 0, conflicts: 0, cursor, duplicates: 0, results: [] };

  let batch = source.mutations(cursor, batchSize);
  while (batch.mutations.length > 0) {
    for (const mutation of batch.mutations) {
      try {
        await options.beforeApply?.(mutation, cursor);
        const applied = target.apply(mutation);
        result.results.push(applied);
        result[applied.status === 'applied' ? 'applied' : applied.status === 'conflict' ? 'conflicts' : 'duplicates'] +=
          1;
        cursor += 1;
        result.cursor = cursor;
      } catch (cause) {
        throw new SyncInterruptedError(cursor, { ...result, results: [...result.results] }, cause);
      }
    }
    batch = source.mutations(cursor, batchSize);
  }
  return result;
};
