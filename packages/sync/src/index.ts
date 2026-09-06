export { LocalSyncReplica } from './local-replica';
export type { MutationBatch } from './local-replica';
export { SYNC_PROTOCOL_VERSION, SyncProtocolError, assertMutation, mutationIdFor } from './protocol';
export type {
  ApplyMutationResult,
  DeleteMutation,
  PutMutation,
  SyncConflict,
  SyncMutation,
  SyncProtocolVersion,
  SyncRevision,
  VersionedRecord,
} from './protocol';
export { SyncInterruptedError, synchronize } from './synchronize';
export type { MutationSource, MutationTarget, SynchronizeOptions, SynchronizeResult } from './synchronize';
