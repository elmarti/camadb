# @camadb/memory

Runtime-neutral contracts for AI memory, retrieval, and embedding provenance. Implementations depend on `@camadb/core`; core never depends on memory or an embedding provider.

## Embedding compatibility

An embedding is meaningful only inside the space that produced it. Record the provider, model, dimensions, application schema, optional immutable model revision, and creation time with every stored vector:

```ts
import {
  EmbeddingProfile,
  createEmbeddingProvenance,
  prepareEmbeddingQuery,
} from '@camadb/memory';

const profile: EmbeddingProfile = {
  provider: 'local-transformers',
  model: 'all-MiniLM-L6-v2',
  dimensions: 384,
  schemaVersion: 'memory-v1',
  revision: 'model-sha',
};

const embeddingProvenance = createEmbeddingProvenance(profile, new Date().toISOString());

// Throws EmbeddingCompatibilityError before search if any part of the
// query embedding space differs from the collection profile.
const vector = prepareEmbeddingQuery(profile, {
  embedding: queryEmbedding,
  provenance: queryProfile,
});
```

Creation timestamps are audit data and do not affect compatibility. Provider, model, dimensions, schema version, and revision do.

## Explicit re-embedding

`planReembedding(records, target)` is a pure inspection step. It returns the memories that can be retained and those requiring re-embedding, with structured mismatch reasons, without changing data.

`stageReembedding(records, target, embed, createdAt)` generates and validates the complete replacement batch in memory. It never writes to CamaDB or mutates its inputs. Commit the returned updates explicitly only after staging succeeds; a provider failure or invalid vector therefore leaves the existing store recoverable. Re-running the plan after a committed batch retains compatible records and selects only outstanding work.

Staging uses memory proportional to the number of replacement embeddings times their dimensions. Process large stores in caller-controlled batches so that this bound remains explicit.
