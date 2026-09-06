# Decision 0004: versioned, explicit synchronization

Status: accepted

## Context

CamaDB is local-first. Synchronization must therefore be optional: a database must remain fully usable while a peer or network is absent. Existing filesystem pages and IndexedDB records are storage implementation details. Their generations and reclaimable tombstones are not a safe synchronization protocol because compaction may remove them.

## Decision

Synchronization lives in the optional `@camadb/sync` package and starts with protocol version `1`. The package is transport-independent; the first adapter transfers mutations directly between two local replicas.

Each replica has a stable, caller-supplied `replicaId` and a monotonically increasing local sequence. A mutation contains:

- `protocolVersion`, currently `1`;
- a deterministic `mutationId` derived from the replica and sequence;
- `replicaId` and `sequence`;
- collection and record identity;
- `parentRevision`, the revision observed by the writer;
- either a complete replacement document (`put`) or a deletion (`delete`).

The mutation ID is also the resulting record revision. Wall-clock timestamps may be carried as metadata later, but never decide ordering or conflicts.

Applying a mutation has three explicit outcomes:

1. A previously processed mutation ID is a duplicate and has no effect.
2. A mutation whose `parentRevision` equals the current record revision is applied.
3. Any other mutation is retained as a conflict and cannot overwrite the record silently.

Deletes create synchronization tombstones. These are distinct from persistence-adapter tombstones and remain part of replica state until a future acknowledgement/retention policy proves that removal is safe. Recreating a deleted ID is an ordinary `put` whose parent is the tombstone revision.

The mutation log is cursor-addressed and append-only. Cursors are opaque to transports even though the local reference uses numeric offsets. Transfers are bounded by a batch size. A receiver records mutation identity in the same in-memory commit as the state transition or conflict, so replay after interruption is idempotent.

Protocol inputs are validated at the boundary. Mutation IDs must agree with their replica and sequence, `put` documents must carry the matching string `_id`, and payloads must be JSON-serializable. Implementations and transports should impose explicit batch and payload limits before accepting untrusted peers.

## Atomicity and durability

The local reference replica commits its state, processed-mutation marker, and log entry as one synchronous operation. This proves replay semantics but is not a durable cross-process transaction. A future persistent replica store must expose one atomic transaction covering those three writes; wrapping an existing collection operation and a separate log append is not sufficient.

Compaction may compact database storage pages, but must not discard sync tombstones or log entries needed by an unacknowledged peer. Durable implementations will require peer checkpoints and an explicit retention policy before log compaction is enabled.

## Relationship to 2.x storage

Version 3 does not silently reinterpret version 2 storage. The detection and explicit export/migration rules from decision 0001 remain the boundary. Synchronization begins only after a store has been opened as an explicit version 3 replica; importing legacy data produces normal version 3 mutations if the caller chooses to synchronize it.

## Consequences

- Local operation never depends on synchronization availability.
- Duplicate delivery and retries are harmless.
- Concurrent offline edits are visible conflicts, not last-write-wins data loss.
- Deletion cannot be mistaken for a missing record and accidentally resurrected.
- Persistent logs, peer acknowledgement, conflict resolution policies, encryption, authentication, and remote transports remain separate follow-up work.
