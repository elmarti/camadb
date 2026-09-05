# @camadb/memory

Runtime-neutral contracts for AI memory, retrieval, and embedding provenance. Implementations depend on `@camadb/core`; core never depends on memory or an embedding provider.

## Local-first memory

Create a typed memory store on any CamaDB adapter. With no embedding provider, the complete remember, text-recall, inspect, edit, export, and forget workflow remains local and functional:

```ts
import { Cama, PersistenceAdapterEnum } from '@camadb/core';
import { CamaMemory } from '@camadb/memory';

const database = new Cama({ persistenceAdapter: PersistenceAdapterEnum.IndexedDb });
const memory = await CamaMemory.create<{ source: string }>(database);

const record = await memory.remember({
  category: 'preference',
  content: 'I prefer concise answers',
  metadata: { source: 'conversation' },
});

const recalled = await memory.recall('concise answers');
const explanation = memory.explain(recalled[0]);
await memory.edit(record.id, { category: 'instruction' });
const backup = await memory.export();
await memory.forget(record.id);
```

Records include a stable ID, record schema version, category, creation/update timestamps, optional expiry, metadata, and optional embedding provenance. Expired records are excluded from `recall()` and `list()` unless `includeExpired` is explicit. Recall is read-only: it does not hide a write or lifecycle update in the search path.

Use `rememberMany()` for imports and caller-controlled batches. Embeddings are resolved and validated before the single collection mutation, so a provider failure cannot partially insert that batch. CamaDB's 10,000-record atomic mutation ceiling still applies.

## Optional embeddings

Embedding SDKs are never installed or selected by this package. Applications may inject an `EmbeddingProvider`, including an entirely local implementation, or configure an `embeddingProfile` and supply precomputed vectors:

```ts
const memory = await CamaMemory.create(database, {
  embeddingProvider: {
    profile,
    embed: (content) => localModel.embed(content),
  },
});

const results = await memory.recall('harbor notes'); // hybrid by default
```

`strategy: 'text'`, `'vector'`, or `'hybrid'` makes retrieval explicit. `auto` uses hybrid retrieval when an embedding provider/query is available and otherwise uses full-text retrieval. Every result exposes the strategy, component scores, matched terms, ranks, fusion contributions, metric, and embedding profile used.

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
