import { Cama, PersistenceAdapterEnum } from '@camadb/core';
import {
  CamaMemory,
  EmbeddingCompatibilityError,
  EmbeddingProfile,
  EmbeddingProvider,
  RecallResult,
} from './index';

interface TestMetadata extends Record<string, unknown> {
  source: string;
}

const profile: EmbeddingProfile = {
  dimensions: 3,
  model: 'deterministic-v1',
  provider: 'test-local',
  revision: 'sha-1',
  schemaVersion: 'memory-content-v1',
};

const vectorFor = (content: string): readonly number[] => {
  if (content.includes('harbor')) return [1, 0, 0];
  if (content.includes('mountain')) return [0, 1, 0];
  return [-1, 0, 0];
};

const provider = (): EmbeddingProvider => ({
  embed: jest.fn(async (content: string) => vectorFor(content)),
  profile,
});

const createStore = async (options: Parameters<typeof CamaMemory.create>[1] = {}) => {
  const database = new Cama({ persistenceAdapter: PersistenceAdapterEnum.InMemory });
  return CamaMemory.create<TestMetadata>(database, {
    collectionName: `memory-${Math.random()}`,
    now: () => new Date('2026-09-05T12:00:00.000Z'),
    ...options,
  });
};

it('remembers typed, inspectable and exportable records with lifecycle metadata', async () => {
  const embeddingProvider = provider();
  const memory = await createStore({ embeddingProvider });
  const remembered = await memory.remember({
    category: 'fact',
    content: 'the harbor is cobalt',
    expiresAt: '2027-01-01T00:00:00.000Z',
    id: 'harbor',
    metadata: { source: 'user' },
  });

  expect(remembered).toEqual({
    category: 'fact',
    content: 'the harbor is cobalt',
    createdAt: '2026-09-05T12:00:00.000Z',
    embedding: [1, 0, 0],
    embeddingProvenance: { ...profile, createdAt: '2026-09-05T12:00:00.000Z' },
    expiresAt: '2027-01-01T00:00:00.000Z',
    id: 'harbor',
    metadata: { source: 'user' },
    schemaVersion: 1,
    updatedAt: '2026-09-05T12:00:00.000Z',
  });
  await expect(memory.inspect('harbor')).resolves.toEqual(remembered);
  await expect(memory.export()).resolves.toEqual({
    exportedAt: '2026-09-05T12:00:00.000Z',
    memories: [remembered],
    schemaVersion: 1,
  });
});

it('stages an embedding batch before one atomic insert', async () => {
  const embeddingProvider: EmbeddingProvider = {
    embed: jest.fn(async (content: string) => {
      if (content === 'fails') throw new Error('provider unavailable');
      return vectorFor(content);
    }),
    profile,
  };
  const memory = await createStore({ embeddingProvider });

  await expect(memory.rememberMany([
    { content: 'harbor memory', id: 'first', metadata: { source: 'batch' } },
    { content: 'fails', id: 'second', metadata: { source: 'batch' } },
  ])).rejects.toThrow('provider unavailable');
  await expect(memory.list({ includeExpired: true })).resolves.toEqual([]);
});

it('recalls with inspectable hybrid scoring and category filters', async () => {
  const embeddingProvider = provider();
  const memory = await createStore({ embeddingProvider });
  await memory.remember({ category: 'fact', content: 'cobalt harbor fact', id: 'fact', metadata: { source: 'a' } });
  await memory.remember({ category: 'preference', content: 'cobalt mountain preference', id: 'preference', metadata: { source: 'b' } });
  await memory.remember({ category: 'fact', content: 'unrelated note', id: 'other', metadata: { source: 'c' } });

  const results = await memory.recall('cobalt harbor', { category: 'fact', limit: 2 });
  expect(results.map(({ memory: record }) => record.id)).toEqual(['fact', 'other']);
  expect(results[0]).toMatchObject({
    explanation: {
      embeddingProfile: profile,
      strategy: 'hybrid',
      text: { matchedTerms: ['cobalt', 'harbor'], rank: 1, score: expect.any(Number) },
      vector: { metric: 'cosine', rank: 1, score: 1 },
    },
    memory: { id: 'fact' },
    score: expect.any(Number),
  });
  const explanation = memory.explain(results[0]);
  explanation.text!.matchedTerms.push('changed');
  expect(results[0].explanation.text!.matchedTerms).toEqual(['cobalt', 'harbor']);
});

it('keeps every embedding service optional for text-only memory', async () => {
  const memory = await createStore();
  await memory.remember({ content: 'local browser memory', id: 'local', metadata: { source: 'device' } });

  await expect(memory.recall('browser')).resolves.toMatchObject([{
    explanation: { strategy: 'text', text: { matchedTerms: ['browser'] } },
    memory: { id: 'local' },
  }]);
});

it('accepts caller-produced vectors and rejects incompatible queries before recall', async () => {
  const memory = await createStore({ embeddingProfile: profile });
  await memory.remember({
    content: 'externally embedded harbor',
    embedding: { embedding: [1, 0, 0], provenance: profile },
    id: 'external',
    metadata: { source: 'external' },
  });
  await expect(memory.recall('', {
    embedding: { embedding: [1, 0, 0], provenance: profile },
    strategy: 'vector',
  })).resolves.toMatchObject([{ memory: { id: 'external' } }]);

  await expect(memory.recall('', {
    embedding: { embedding: [1, 0], provenance: { ...profile, dimensions: 2, model: 'other' } },
    strategy: 'vector',
  })).rejects.toBeInstanceOf(EmbeddingCompatibilityError);
});

it('excludes expired records unless explicitly requested', async () => {
  const memory = await createStore();
  await memory.remember({
    content: 'expired searchable memory',
    expiresAt: '2026-01-01T00:00:00.000Z',
    id: 'expired',
    metadata: { source: 'old' },
  });
  await memory.remember({ content: 'live searchable memory', id: 'live', metadata: { source: 'new' } });

  expect((await memory.recall('searchable')).map(({ memory: record }) => record.id)).toEqual(['live']);
  expect((await memory.list()).map(({ id }) => id)).toEqual(['live']);
  expect((await memory.list({ includeExpired: true })).map(({ id }) => id)).toEqual(['expired', 'live']);
});

it('edits content and metadata without retaining stale embeddings', async () => {
  const embeddingProvider = provider();
  const memory = await createStore({ embeddingProvider });
  await memory.remember({ content: 'harbor memory', id: 'editable', metadata: { source: 'first' } });

  const edited = await memory.edit('editable', {
    category: 'summary',
    content: 'mountain memory',
    expiresAt: '2027-01-01T00:00:00.000Z',
    metadata: { source: 'edited' },
  });
  expect(edited).toMatchObject({
    category: 'summary',
    embedding: [0, 1, 0],
    metadata: { source: 'edited' },
  });
  expect(embeddingProvider.embed).toHaveBeenCalledTimes(2);

  await expect(memory.edit('editable', { embedding: null, expiresAt: null, metadata: null })).resolves.toEqual({
    category: 'summary',
    content: 'mountain memory',
    createdAt: '2026-09-05T12:00:00.000Z',
    id: 'editable',
    schemaVersion: 1,
    updatedAt: '2026-09-05T12:00:00.000Z',
  });
});

it('forgets a memory idempotently', async () => {
  const memory = await createStore();
  await memory.remember({ content: 'temporary', id: 'temporary', metadata: { source: 'test' } });

  await expect(memory.forget('temporary')).resolves.toEqual({ forgotten: true, id: 'temporary' });
  await expect(memory.forget('temporary')).resolves.toEqual({ forgotten: false, id: 'temporary' });
  await expect(memory.inspect('temporary')).resolves.toBeUndefined();
});

it('exposes a typed recall result contract', () => {
  const result: RecallResult<TestMetadata> = {
    explanation: { strategy: 'text' },
    memory: {
      category: 'fact',
      content: 'typed',
      createdAt: '2026-09-05T12:00:00.000Z',
      id: 'typed',
      metadata: { source: 'compile-time' },
      schemaVersion: 1,
      updatedAt: '2026-09-05T12:00:00.000Z',
    },
    score: 1,
  };
  expect(result.memory.metadata.source).toBe('compile-time');
});
