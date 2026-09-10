import {
  ApplyMutationResult,
  DeleteMutation,
  PutMutation,
  SyncConflict,
  SyncMutation,
  SyncProtocolError,
  VersionedRecord,
  assertMutation,
  mutationIdFor,
  SYNC_PROTOCOL_VERSION,
} from './protocol';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const recordKey = (collection: string, recordId: string): string => `${collection}\u0000${recordId}`;

export interface MutationBatch<TDocument extends object> {
  cursor: number;
  mutations: SyncMutation<TDocument>[];
  nextCursor: number;
}

export class LocalSyncReplica<TDocument extends object = Record<string, unknown>> {
  private readonly conflictsById = new Map<string, SyncConflict<TDocument>>();
  private readonly log: SyncMutation<TDocument>[] = [];
  private readonly processed = new Map<string, ApplyMutationResult<TDocument>>();
  private readonly records = new Map<string, VersionedRecord<TDocument>>();
  private sequence = 0;

  /**
   * Create an empty in-memory reference replica with a non-empty stable identity. Records and mutation history are not durable across process restarts.
   */
  constructor(readonly replicaId: string) {
    if (!replicaId) throw new SyncProtocolError('Replica identity must be non-empty');
  }

  /**
   * Create and apply a local put mutation against the current parent revision. The document must carry a string _id and be JSON-serializable.
   */
  put(collection: string, document: TDocument & { _id: string }): ApplyMutationResult<TDocument> {
    const mutation = this.createMutation(collection, document._id, {
      document: clone(document),
      operation: 'put',
    });
    return this.apply(mutation);
  }

  /**
   * Create a delete tombstone for a record against its current parent revision; retains revision evidence for replay.
   */
  delete(collection: string, recordId: string): ApplyMutationResult<TDocument> {
    return this.apply(this.createMutation(collection, recordId, { operation: 'delete' }));
  }

  /**
   * Validate and replay a mutation idempotently. Returns applied, duplicate or conflict; rejects mutation-ID reuse with a different payload.
   */
  apply(mutation: SyncMutation<TDocument>): ApplyMutationResult<TDocument> {
    assertMutation(mutation);
    const safeMutation = clone(mutation);
    const previous = this.processed.get(safeMutation.mutationId);
    if (previous) {
      if (JSON.stringify(previous.mutation) !== JSON.stringify(safeMutation)) {
        throw new SyncProtocolError(`Mutation ID ${safeMutation.mutationId} was reused with a different payload`);
      }
      return { mutation: clone(safeMutation), status: 'duplicate' };
    }

    const key = recordKey(safeMutation.collection, safeMutation.recordId);
    const current = this.records.get(key) ?? null;
    let result: ApplyMutationResult<TDocument>;
    if ((current?.revision ?? null) !== safeMutation.parentRevision) {
      const conflict: SyncConflict<TDocument> = {
        conflictId: safeMutation.mutationId,
        current: current ? clone(current) : null,
        incoming: clone(safeMutation),
      };
      this.conflictsById.set(conflict.conflictId, conflict);
      result = { conflict, mutation: safeMutation, status: 'conflict' };
    } else {
      this.records.set(key, {
        document: safeMutation.operation === 'put' ? clone(safeMutation.document) : null,
        revision: safeMutation.mutationId,
        tombstone: safeMutation.operation === 'delete',
      });
      this.log.push(safeMutation);
      result = { mutation: safeMutation, status: 'applied' };
    }
    this.processed.set(safeMutation.mutationId, clone(result));
    return clone(result);
  }

  /**
   * Return a cloned live document or undefined when absent/deleted. Does not expose internal replica state.
   */
  get(collection: string, recordId: string): (TDocument & { _id: string }) | undefined {
    const record = this.records.get(recordKey(collection, recordId));
    return record?.document ? clone(record.document) : undefined;
  }

  /**
   * Return cloned versioned state, including tombstones, or undefined when the record is unknown.
   */
  inspect(collection: string, recordId: string): VersionedRecord<TDocument> | undefined {
    const record = this.records.get(recordKey(collection, recordId));
    return record ? clone(record) : undefined;
  }

  /**
   * Return cloned unresolved conflict evidence accumulated by this reference replica.
   */
  conflicts(): SyncConflict<TDocument>[] {
    return [...this.conflictsById.values()].map(clone);
  }

  /**
   * Read a bounded slice of the applied-mutation log. Cursor is a non-negative offset and limit a positive integer; the next cursor advances by returned entries.
   */
  mutations(cursor = 0, limit = 100): MutationBatch<TDocument> {
    if (!Number.isSafeInteger(cursor) || cursor < 0)
      throw new SyncProtocolError('Cursor must be a non-negative integer');
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new SyncProtocolError('Batch limit must be a positive integer');
    const mutations = this.log.slice(cursor, cursor + limit).map(clone);
    return { cursor, mutations, nextCursor: cursor + mutations.length };
  }

  /**
   * Number of applied mutations currently retained in this in-memory log.
   */
  get mutationCount(): number {
    return this.log.length;
  }

  private createMutation(
    collection: string,
    recordId: string,
    operation: { document: TDocument & { _id: string }; operation: 'put' } | { operation: 'delete' },
  ): SyncMutation<TDocument> {
    if (!collection || !recordId) throw new SyncProtocolError('Collection and record identities must be non-empty');
    this.sequence += 1;
    const base = {
      collection,
      mutationId: mutationIdFor(this.replicaId, this.sequence),
      parentRevision: this.records.get(recordKey(collection, recordId))?.revision ?? null,
      protocolVersion: SYNC_PROTOCOL_VERSION,
      recordId,
      replicaId: this.replicaId,
      sequence: this.sequence,
    };
    return operation.operation === 'put'
      ? ({ ...base, document: operation.document, operation: 'put' } satisfies PutMutation<TDocument>)
      : ({ ...base, operation: 'delete' } satisfies DeleteMutation);
  }
}
