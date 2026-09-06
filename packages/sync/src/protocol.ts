export const SYNC_PROTOCOL_VERSION = 1 as const;

export type SyncProtocolVersion = typeof SYNC_PROTOCOL_VERSION;
export type SyncRevision = string;

interface MutationBase {
  collection: string;
  mutationId: string;
  parentRevision: SyncRevision | null;
  protocolVersion: SyncProtocolVersion;
  recordId: string;
  replicaId: string;
  sequence: number;
}

export interface PutMutation<TDocument extends object> extends MutationBase {
  document: TDocument & { _id: string };
  operation: 'put';
}

export interface DeleteMutation extends MutationBase {
  operation: 'delete';
}

export type SyncMutation<TDocument extends object = Record<string, unknown>> = PutMutation<TDocument> | DeleteMutation;

export interface VersionedRecord<TDocument extends object> {
  document: (TDocument & { _id: string }) | null;
  revision: SyncRevision;
  tombstone: boolean;
}

export interface SyncConflict<TDocument extends object> {
  conflictId: string;
  current: VersionedRecord<TDocument> | null;
  incoming: SyncMutation<TDocument>;
}

export type ApplyMutationResult<TDocument extends object> =
  | { mutation: SyncMutation<TDocument>; status: 'applied' }
  | { mutation: SyncMutation<TDocument>; status: 'duplicate' }
  | { conflict: SyncConflict<TDocument>; mutation: SyncMutation<TDocument>; status: 'conflict' };

export class SyncProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncProtocolError';
  }
}

export const mutationIdFor = (replicaId: string, sequence: number): string =>
  `${encodeURIComponent(replicaId)}:${sequence}`;

export const assertMutation = <TDocument extends object>(mutation: SyncMutation<TDocument>): void => {
  if (mutation.protocolVersion !== SYNC_PROTOCOL_VERSION) {
    throw new SyncProtocolError(`Unsupported synchronization protocol version: ${String(mutation.protocolVersion)}`);
  }
  if (!mutation.replicaId || !mutation.collection || !mutation.recordId) {
    throw new SyncProtocolError('Mutation replica, collection and record identities must be non-empty');
  }
  if (!Number.isSafeInteger(mutation.sequence) || mutation.sequence < 1) {
    throw new SyncProtocolError('Mutation sequence must be a positive safe integer');
  }
  if (mutation.mutationId !== mutationIdFor(mutation.replicaId, mutation.sequence)) {
    throw new SyncProtocolError('Mutation ID does not match its replica and sequence');
  }
  if (mutation.operation === 'put' && mutation.document._id !== mutation.recordId) {
    throw new SyncProtocolError('Put document identity does not match its mutation record identity');
  }
  try {
    const encoded = JSON.stringify(mutation);
    if (encoded === undefined) throw new Error('undefined payload');
  } catch {
    throw new SyncProtocolError('Mutation payload must be JSON-serializable');
  }
};
