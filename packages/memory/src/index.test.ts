import type { EmbeddingProvenance, MemoryRecord } from './index';

it('keeps embedding provenance attached to a memory record', () => {
  const provenance: EmbeddingProvenance = {
    provider: 'test',
    model: 'embedding-v1',
    dimensions: 2,
    createdAt: '2026-08-31T00:00:00.000Z',
  };
  const memory: MemoryRecord = { id: 'one', content: 'hello', embedding: [0, 1], embeddingProvenance: provenance };
  expect(memory.embeddingProvenance).toBe(provenance);
});
