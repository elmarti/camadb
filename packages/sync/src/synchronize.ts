import { ApplyMutationResult, SyncMutation } from './protocol';

export interface MutationSource<TDocument extends object> {
  /**
   * Read a bounded batch from the source log starting at the supplied cursor; an empty batch ends replay.
   */
  mutations(
    cursor: number,
    limit: number,
  ): {
    mutations: SyncMutation<TDocument>[];
    nextCursor: number;
  };
}

export interface MutationTarget<TDocument extends object> {
  /**
   * Apply a validated mutation idempotently and return an explicit application, duplicate or conflict result.
   */
  apply(mutation: SyncMutation<TDocument>): ApplyMutationResult<TDocument>;
}

export interface SynchronizeOptions<TDocument extends object> {
  batchSize?: number;
  cursor?: number;
  /**
   * Optional asynchronous hook before each target apply. A rejection interrupts replay at the last acknowledged cursor.
   */
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
  /**
   * Retain the acknowledged source cursor, partial results and original cause when replay is interrupted.
   */
  constructor(
    readonly cursor: number,
    readonly partial: SynchronizeResult<TDocument>,
    readonly cause: unknown,
  ) {
    super(`Synchronization interrupted after cursor ${cursor}`);
    this.name = 'SyncInterruptedError';
  }
}

/**
 * Replay one source log into one target in bounded batches.
 * This operation is directional; the application supplies durable storage and transport.
 * @param source - Mutation log exposing cursor-based batches.
 * @param target - Replica accepting idempotent mutation application.
 * @param options - Starting cursor, positive batch size and optional pre-apply hook.
 * @returns Applied, duplicate and conflict counts with the final source cursor.
 * @throws SyncInterruptedError when a pre-apply hook or target apply fails; use its cursor to resume.
 * @example
 * ```ts
 * const result = await synchronize(laptop, desktop, { batchSize: 100 });
 * const next = await synchronize(laptop, desktop, { cursor: result.cursor });
 * ```
 */
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
