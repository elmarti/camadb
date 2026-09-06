import {
  LocalSyncReplica,
  SYNC_PROTOCOL_VERSION,
  SyncInterruptedError,
  SyncMutation,
  SyncProtocolError,
  synchronize,
} from './index';

interface Note {
  _id: string;
  text: string;
}

it('queues local work offline and later synchronizes it in bounded batches', async () => {
  const laptop = new LocalSyncReplica<Note>('laptop');
  const desktop = new LocalSyncReplica<Note>('desktop');
  laptop.put('notes', { _id: 'one', text: 'offline' });
  laptop.put('notes', { _id: 'two', text: 'also offline' });

  expect(desktop.get('notes', 'one')).toBeUndefined();
  await expect(synchronize(laptop, desktop, { batchSize: 1 })).resolves.toMatchObject({ applied: 2, cursor: 2 });
  expect(desktop.get('notes', 'one')).toEqual({ _id: 'one', text: 'offline' });
  expect(desktop.get('notes', 'two')).toEqual({ _id: 'two', text: 'also offline' });
});

it('replays duplicate deliveries idempotently', async () => {
  const source = new LocalSyncReplica<Note>('source');
  const target = new LocalSyncReplica<Note>('target');
  source.put('notes', { _id: 'one', text: 'only once' });

  await synchronize(source, target);
  const replay = await synchronize(source, target);

  expect(replay).toMatchObject({ applied: 0, cursor: 1, duplicates: 1 });
  expect(target.mutationCount).toBe(1);
});

it('resumes after interruption without losing or duplicating mutations', async () => {
  const source = new LocalSyncReplica<Note>('source');
  const target = new LocalSyncReplica<Note>('target');
  source.put('notes', { _id: 'one', text: 'first' });
  source.put('notes', { _id: 'two', text: 'second' });
  source.put('notes', { _id: 'three', text: 'third' });
  let attempts = 0;

  const interrupted = synchronize(source, target, {
    beforeApply: () => {
      attempts += 1;
      if (attempts === 2) throw new Error('transport disconnected');
    },
  });
  await expect(interrupted).rejects.toMatchObject({ cursor: 1, name: 'SyncInterruptedError' });

  const resumed = await synchronize(source, target, { cursor: 1 });
  expect(resumed).toMatchObject({ applied: 2, cursor: 3, duplicates: 0 });
  expect(['one', 'two', 'three'].map((id) => target.get('notes', id)?.text)).toEqual(['first', 'second', 'third']);
});

it('makes retrying the original batch harmless after an uncertain acknowledgement', async () => {
  const source = new LocalSyncReplica<Note>('source');
  const target = new LocalSyncReplica<Note>('target');
  source.put('notes', { _id: 'one', text: 'committed before disconnect' });
  await synchronize(source, target);

  await expect(synchronize(source, target, { cursor: 0 })).resolves.toMatchObject({ duplicates: 1 });
  expect(target.mutationCount).toBe(1);
});

it('reports concurrent offline edits instead of overwriting either silently', async () => {
  const left = new LocalSyncReplica<Note>('left');
  const right = new LocalSyncReplica<Note>('right');
  left.put('notes', { _id: 'shared', text: 'left edit' });
  right.put('notes', { _id: 'shared', text: 'right edit' });

  const result = await synchronize(left, right);

  expect(result.conflicts).toBe(1);
  expect(right.get('notes', 'shared')).toEqual({ _id: 'shared', text: 'right edit' });
  expect(right.conflicts()).toMatchObject([
    {
      current: { document: { text: 'right edit' }, revision: 'right:1' },
      incoming: { document: { text: 'left edit' }, parentRevision: null },
    },
  ]);
});

it('retains delete tombstones and permits an explicit revision-linked recreation', async () => {
  const replica = new LocalSyncReplica<Note>('local');
  replica.put('notes', { _id: 'one', text: 'before' });
  replica.delete('notes', 'one');

  expect(replica.get('notes', 'one')).toBeUndefined();
  expect(replica.inspect('notes', 'one')).toEqual({ document: null, revision: 'local:2', tombstone: true });

  replica.put('notes', { _id: 'one', text: 'after' });
  expect(replica.inspect('notes', 'one')).toEqual({
    document: { _id: 'one', text: 'after' },
    revision: 'local:3',
    tombstone: false,
  });
  expect(replica.mutations(2, 1).mutations[0]).toMatchObject({ parentRevision: 'local:2' });
});

it('rejects malformed protocol input and mutation ID reuse', () => {
  const replica = new LocalSyncReplica<Note>('target');
  const mutation: SyncMutation<Note> = {
    collection: 'notes',
    document: { _id: 'one', text: 'valid' },
    mutationId: 'source:1',
    operation: 'put',
    parentRevision: null,
    protocolVersion: SYNC_PROTOCOL_VERSION,
    recordId: 'one',
    replicaId: 'source',
    sequence: 1,
  };
  replica.apply(mutation);
  expect(() => replica.apply({ ...mutation, document: { _id: 'one', text: 'different' } })).toThrow(SyncProtocolError);
});

it('surfaces the interruption cause and safe checkpoint', async () => {
  const source = new LocalSyncReplica<Note>('source');
  const target = new LocalSyncReplica<Note>('target');
  source.put('notes', { _id: 'one', text: 'value' });
  const failure = new Error('unavailable');

  const error = await synchronize(source, target, {
    beforeApply: () => {
      throw failure;
    },
  }).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(SyncInterruptedError);
  expect(error).toMatchObject({ cause: failure, cursor: 0 });
});
