import {
  EmbeddingCompatibilityError,
  EmbeddingProfile,
  EmbeddingProvenance,
  MemoryRecord,
  compareEmbeddingProvenance,
  planReembedding,
  prepareEmbeddingQuery,
  stageReembedding,
} from './index';

const profile: EmbeddingProfile = {
  provider: 'local',
  model: 'embedding-v1',
  dimensions: 2,
  schemaVersion: 'memory-v1',
  revision: 'sha-1',
};

const provenance = (overrides: Partial<EmbeddingProvenance> = {}): EmbeddingProvenance => ({
  ...profile,
  createdAt: '2026-08-31T00:00:00.000Z',
  ...overrides,
});

it('keeps embedding provenance attached to a memory record', () => {
  const source = provenance();
  const memory: MemoryRecord = { id: 'one', content: 'hello', embedding: [0, 1], embeddingProvenance: source };
  expect(memory.embeddingProvenance).toBe(source);
});

it('accepts only queries from the configured embedding space', () => {
  expect(prepareEmbeddingQuery(profile, { embedding: [0, 1], provenance: profile })).toEqual([0, 1]);
  expect(() => prepareEmbeddingQuery(profile, { embedding: [0], provenance: profile }))
    .toThrow('Embedding query has dimension 1; expected 2');

  let error: unknown;
  try {
    prepareEmbeddingQuery(profile, {
      embedding: [0, 1, 2],
      provenance: { ...profile, dimensions: 3, model: 'embedding-v2', schemaVersion: 'memory-v2' },
    });
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(EmbeddingCompatibilityError);
  expect((error as EmbeddingCompatibilityError).code).toBe('EMBEDDING_PROVENANCE_MISMATCH');
  expect((error as EmbeddingCompatibilityError).mismatches.map(({ field }) => field))
    .toEqual(['model', 'dimensions', 'schemaVersion']);
});

it('reports compatible profiles without comparing creation timestamps', () => {
  expect(compareEmbeddingProvenance(profile, provenance({ createdAt: '2027-01-01T00:00:00.000Z' }))).toEqual({
    compatible: true,
    mismatches: [],
  });
});

it('plans re-embedding without mutating source memories', () => {
  const memories: MemoryRecord[] = [
    { id: 'keep', content: 'keep', embedding: [1, 0], embeddingProvenance: provenance() },
    { id: 'missing-vector', content: 'missing' },
    { id: 'missing-provenance', content: 'old', embedding: [0, 1] },
    {
      id: 'old-model',
      content: 'old model',
      embedding: [0, 1],
      embeddingProvenance: provenance({ model: 'embedding-v0' }),
    },
  ];
  const before = JSON.stringify(memories);
  const plan = planReembedding(memories, profile);

  expect(plan.keepIds).toEqual(['keep']);
  expect(plan.reembedIds).toEqual(['missing-vector', 'missing-provenance', 'old-model']);
  expect(plan.items[3]).toMatchObject({
    action: 'reembed',
    mismatches: [{ expected: 'embedding-v1', field: 'model', received: 'embedding-v0' }],
    reason: 'incompatible-provenance',
  });
  expect(JSON.stringify(memories)).toBe(before);
});

it('stages a complete validated update batch for an explicit later commit', async () => {
  const memories: MemoryRecord[] = [
    { id: 'keep', content: 'keep', embedding: [1, 0], embeddingProvenance: provenance() },
    { id: 'replace', content: 'replace', embedding: [0, 1] },
  ];
  const updates = await stageReembedding(
    memories,
    profile,
    async (memory) => memory.id === 'replace' ? [0.25, 0.75] : [1, 0],
    '2026-09-05T00:00:00.000Z',
  );

  expect(updates).toEqual([{
    embedding: [0.25, 0.75],
    embeddingProvenance: { ...profile, createdAt: '2026-09-05T00:00:00.000Z' },
    id: 'replace',
  }]);
  expect(memories[1].embeddingProvenance).toBeUndefined();
});

it('rejects an invalid staged vector without returning partial updates', async () => {
  const memories: MemoryRecord[] = [
    { id: 'first', content: 'first' },
    { id: 'second', content: 'second' },
  ];
  await expect(stageReembedding(
    memories,
    profile,
    async (memory) => memory.id === 'first' ? [1, 0] : [1],
    '2026-09-05T00:00:00.000Z',
  )).rejects.toThrow('memory "second" has dimension 1; expected 2');
  expect(memories.every(({ embedding }) => embedding === undefined)).toBe(true);
});
