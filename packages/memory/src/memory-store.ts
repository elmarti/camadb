import type {
  Filter,
  HybridSearchHit,
  ICama,
  ICollection,
  StoredDocument,
  TextSearchHit,
  VectorSearchHit,
} from '@camadb/core';
import {
  assertEmbeddingCompatibility,
  createEmbeddingProvenance,
  prepareEmbeddingQuery,
  validateEmbeddingProfile,
  validateEmbeddingVector,
} from './embedding-provenance';
import type { EmbeddingProfile, EmbeddingQuery } from './embedding-provenance';
import {
  MEMORY_CATEGORIES,
  MEMORY_EXPORT_SCHEMA_VERSION,
  MEMORY_RECORD_SCHEMA_VERSION,
} from './memory-types';
import type {
  EditMemoryInput,
  ForgetResult,
  ListMemoriesOptions,
  MemoryCategory,
  MemoryExport,
  MemoryRecord,
  MemoryStore,
  MemoryStoreOptions,
  RecallExplanation,
  RecallOptions,
  RecallResult,
  RecallStrategy,
  RememberInput,
  StoredMemoryDocument,
} from './memory-types';

const DEFAULT_COLLECTION = 'memories';
const DEFAULT_LIMIT = 10;
const DEFAULT_CATEGORY: MemoryCategory = 'other';

type StoredMemory<Metadata extends Record<string, unknown>> = StoredDocument<StoredMemoryDocument<Metadata>>;

const clone = <T>(value: T): T => typeof structuredClone === 'function'
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value)) as T;

const assertNonEmpty = (value: string, label: string): void => {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
};

const normalizeTimestamp = (value: string, label: string): string => {
  const milliseconds = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(milliseconds)) {
    throw new Error(`${label} must be an ISO-8601 timestamp`);
  }
  return new Date(milliseconds).toISOString();
};

const assertCategory = (category: MemoryCategory): void => {
  if (!(MEMORY_CATEGORIES as readonly unknown[]).includes(category)) {
    throw new Error(`Unknown memory category: ${String(category)}`);
  }
};

const assertLimit = (value: number | undefined, label: string, minimum = 0): void => {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < minimum)) {
    throw new Error(`${label} must be an integer greater than or equal to ${minimum}`);
  }
};

export class CamaMemory<Metadata extends Record<string, unknown> = Record<string, unknown>>
implements MemoryStore<Metadata> {
  private constructor(
    private readonly collection: ICollection<StoredMemoryDocument<Metadata>>,
    private readonly options: MemoryStoreOptions,
    private readonly profile: EmbeddingProfile | undefined,
  ) {}

  static async create<Metadata extends Record<string, unknown> = Record<string, unknown>>(
    database: ICama,
    options: MemoryStoreOptions = {},
  ): Promise<CamaMemory<Metadata>> {
    const profile = options.embeddingProvider?.profile ?? options.embeddingProfile;
    if (options.embeddingProvider && options.embeddingProfile) {
      assertEmbeddingCompatibility(options.embeddingProvider.profile, options.embeddingProfile);
    }
    if (profile) validateEmbeddingProfile(profile, 'Configured embedding profile');
    const collection = await database.initCollection<StoredMemoryDocument<Metadata>>(
      options.collectionName ?? DEFAULT_COLLECTION,
      {
        columns: [],
        indexes: ['category', 'expiresAt'],
        searchIndexes: ['content'],
        vectorIndexes: profile ? [{ dimensions: profile.dimensions, field: 'embedding' }] : [],
      },
    );
    return new CamaMemory(collection, { ...options }, profile ? { ...profile } : undefined);
  }

  async remember(input: RememberInput<Metadata>): Promise<MemoryRecord<Metadata>> {
    const [remembered] = await this.rememberMany([input]);
    return remembered;
  }

  async rememberMany(inputs: readonly RememberInput<Metadata>[]): Promise<readonly MemoryRecord<Metadata>[]> {
    if (inputs.length === 0) return [];
    const documents: Array<StoredMemoryDocument<Metadata> & { _id?: string }> = [];
    for (const input of inputs) {
      assertNonEmpty(input.content, 'Memory content');
      if (input.id !== undefined) assertNonEmpty(input.id, 'Memory id');
      const category = input.category ?? DEFAULT_CATEGORY;
      assertCategory(category);
      const expiresAt = input.expiresAt === undefined
        ? undefined
        : normalizeTimestamp(input.expiresAt, 'Memory expiresAt');
      const now = this.now();
      const embedded = await this.embeddingFor(input.content, input.embedding, now);
      documents.push({
        _id: input.id,
        category,
        content: input.content,
        createdAt: now,
        ...(embedded ?? {}),
        ...(expiresAt === undefined ? {} : { expiresAt }),
        ...(input.metadata === undefined ? {} : { metadata: clone(input.metadata) }),
        schemaVersion: MEMORY_RECORD_SCHEMA_VERSION,
        updatedAt: now,
      });
    }
    const { insertedIds } = await this.collection.insertMany(documents);
    return documents.map((document, index) => this.toRecord({ ...document, _id: insertedIds[index] }));
  }

  async recall(query: string, options: RecallOptions = {}): Promise<readonly RecallResult<Metadata>[]> {
    assertLimit(options.limit, 'Recall limit');
    assertLimit(options.candidateLimit, 'Recall candidateLimit', 1);
    const limit = options.limit ?? DEFAULT_LIMIT;
    if (limit === 0) return [];
    const text = query.trim();
    const strategy = this.resolveStrategy(text, options);
    const vector = strategy === 'text' ? undefined : await this.queryEmbedding(text, options.embedding);
    if ((strategy === 'text' || strategy === 'hybrid') && text.length === 0) {
      throw new Error(`${strategy === 'text' ? 'Text' : 'Hybrid'} recall requires a non-empty query`);
    }
    const filter = this.filter(options.category, options.includeExpired === true);

    if (strategy === 'text') {
      const hits = await this.collection.searchText(text, { filter, limit, match: options.match });
      return hits.map((hit, index) => this.fromTextHit(hit, index));
    }
    if (strategy === 'vector') {
      const hits = await this.collection.searchVector('embedding', vector!, {
        filter,
        limit,
        metric: options.metric,
      });
      return hits.map((hit, index) => this.fromVectorHit(hit, index, options.metric ?? 'cosine'));
    }
    const hits = await this.collection.searchHybrid({
      candidateLimit: options.candidateLimit,
      filter,
      fusion: options.fusion,
      limit,
      text: { match: options.match, query: text },
      vector: { field: 'embedding', metric: options.metric, query: vector! },
    });
    return hits.map((hit) => this.fromHybridHit(hit, options.metric ?? 'cosine'));
  }

  explain(result: RecallResult<Metadata>): RecallExplanation {
    return clone(result.explanation);
  }

  async inspect(id: string): Promise<MemoryRecord<Metadata> | undefined> {
    assertNonEmpty(id, 'Memory id');
    const { rows } = await this.collection.findMany({ _id: id }, { limit: 1 });
    return rows[0] ? this.toRecord(rows[0]) : undefined;
  }

  async list(options: ListMemoriesOptions = {}): Promise<readonly MemoryRecord<Metadata>[]> {
    assertLimit(options.limit, 'List limit');
    assertLimit(options.offset, 'List offset');
    const result = await this.collection.findMany(
      this.filter(options.category, options.includeExpired === true),
      { limit: options.limit, offset: options.offset },
    );
    return result.rows.map((document) => this.toRecord(document));
  }

  async edit(id: string, changes: EditMemoryInput<Metadata>): Promise<MemoryRecord<Metadata>> {
    const current = await this.inspect(id);
    if (!current) throw new Error(`Memory "${id}" does not exist`);
    if (changes.content !== undefined) assertNonEmpty(changes.content, 'Memory content');
    if (changes.category !== undefined) assertCategory(changes.category);
    const expiresAt = typeof changes.expiresAt === 'string'
      ? normalizeTimestamp(changes.expiresAt, 'Memory expiresAt')
      : changes.expiresAt;
    const content = changes.content ?? current.content;
    const replaceEmbedding = changes.embedding !== undefined || changes.content !== undefined;
    const embedded = replaceEmbedding
      ? changes.embedding === null
        ? undefined
        : await this.embeddingFor(content, changes.embedding)
      : current.embedding && current.embeddingProvenance
        ? { embedding: [...current.embedding], embeddingProvenance: { ...current.embeddingProvenance } }
        : undefined;
    const next: MemoryRecord<Metadata> = {
      category: changes.category ?? current.category,
      content,
      createdAt: current.createdAt,
      ...(embedded ?? {}),
      ...(expiresAt === null
        ? {}
        : { expiresAt: expiresAt ?? current.expiresAt }),
      id,
      ...(changes.metadata === null
        ? {}
        : { metadata: changes.metadata === undefined ? current.metadata : clone(changes.metadata) }),
      schemaVersion: MEMORY_RECORD_SCHEMA_VERSION,
      updatedAt: this.now(),
    };
    const set = this.toStoredDocument(next);
    const unset: Partial<Record<keyof StoredMemoryDocument<Metadata>, boolean>> = {};
    if (!next.embedding) unset.embedding = true;
    if (!next.embeddingProvenance) unset.embeddingProvenance = true;
    if (!next.expiresAt) unset.expiresAt = true;
    if (!next.metadata) unset.metadata = true;
    await this.collection.updateMany(
      { _id: id },
      Object.keys(unset).length === 0 ? { $set: set } : { $set: set, $unset: unset },
    );
    return this.toRecord({ ...set, _id: id });
  }

  async forget(id: string): Promise<ForgetResult> {
    assertNonEmpty(id, 'Memory id');
    const result = await this.collection.deleteOne({ _id: id });
    return { forgotten: result.deletedCount === 1, id };
  }

  async export(): Promise<MemoryExport<Metadata>> {
    return {
      exportedAt: this.now(),
      memories: await this.list({ includeExpired: true }),
      schemaVersion: MEMORY_EXPORT_SCHEMA_VERSION,
    };
  }

  private now(): string {
    const value = (this.options.now ?? (() => new Date()))();
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error('Memory clock must return a valid Date');
    return value.toISOString();
  }

  private async embeddingFor(content: string, supplied?: EmbeddingQuery, createdAt = this.now()): Promise<{
    embedding: readonly number[];
    embeddingProvenance: ReturnType<typeof createEmbeddingProvenance>;
  } | undefined> {
    if (supplied) {
      if (!this.profile) throw new Error('Embedding storage requires an embeddingProfile or embeddingProvider');
      const embedding = prepareEmbeddingQuery(this.profile, supplied);
      return {
        embedding: [...embedding],
        embeddingProvenance: createEmbeddingProvenance(this.profile, createdAt),
      };
    }
    if (!this.options.embeddingProvider) return undefined;
    const embedding = await this.options.embeddingProvider.embed(content);
    validateEmbeddingVector(embedding, this.profile!.dimensions, 'Embedding provider result');
    return {
      embedding: [...embedding],
      embeddingProvenance: createEmbeddingProvenance(this.profile!, createdAt),
    };
  }

  private async queryEmbedding(text: string, supplied?: EmbeddingQuery): Promise<readonly number[]> {
    if (!this.profile) throw new Error('Vector recall requires an embeddingProfile or embeddingProvider');
    if (supplied) return prepareEmbeddingQuery(this.profile, supplied);
    const provider = this.options.embeddingProvider;
    if (!provider) throw new Error('Vector recall requires an embedding query or embeddingProvider');
    assertNonEmpty(text, 'Vector recall query');
    const embedding = await provider.embed(text);
    validateEmbeddingVector(embedding, this.profile.dimensions, 'Embedding provider result');
    return embedding;
  }

  private resolveStrategy(text: string, options: RecallOptions): Exclude<RecallStrategy, 'auto'> {
    const requested = options.strategy ?? 'auto';
    if (!['auto', 'hybrid', 'text', 'vector'].includes(requested)) {
      throw new Error(`Unknown recall strategy: ${String(requested)}`);
    }
    if (requested !== 'auto') return requested;
    if (options.embedding || this.options.embeddingProvider) return text ? 'hybrid' : 'vector';
    return 'text';
  }

  private filter(
    category: MemoryCategory | readonly MemoryCategory[] | undefined,
    includeExpired: boolean,
  ): Filter<StoredMemory<Metadata>> {
    const conditions: Filter<StoredMemory<Metadata>>[] = [];
    if (category) {
      const categories = Array.isArray(category) ? category : [category];
      if (categories.length === 0) return { _id: { $in: [] } };
      categories.forEach((value) => assertCategory(value));
      conditions.push({ category: { $in: categories } });
    }
    if (!includeExpired) {
      conditions.push({
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: { $gt: this.now() } },
        ],
      });
    }
    return conditions.length === 0 ? {} : conditions.length === 1 ? conditions[0] : { $and: conditions };
  }

  private fromTextHit(hit: TextSearchHit<StoredMemory<Metadata>>, index: number): RecallResult<Metadata> {
    return {
      explanation: {
        strategy: 'text',
        text: {
          contribution: hit.score,
          matchedTerms: [...hit.matchedTerms],
          rank: index + 1,
          score: hit.score,
        },
      },
      memory: this.toRecord(hit.document),
      score: hit.score,
    };
  }

  private fromVectorHit(
    hit: VectorSearchHit<StoredMemory<Metadata>>,
    index: number,
    metric: 'cosine' | 'dot' | 'euclidean',
  ): RecallResult<Metadata> {
    return {
      explanation: {
        embeddingProfile: this.profile ? { ...this.profile } : undefined,
        strategy: 'vector',
        vector: { contribution: hit.score, metric, rank: index + 1, score: hit.score },
      },
      memory: this.toRecord(hit.document),
      score: hit.score,
    };
  }

  private fromHybridHit(
    hit: HybridSearchHit<StoredMemory<Metadata>>,
    metric: 'cosine' | 'dot' | 'euclidean',
  ): RecallResult<Metadata> {
    return {
      explanation: {
        embeddingProfile: this.profile ? { ...this.profile } : undefined,
        strategy: 'hybrid',
        text: hit.components.text ? { ...hit.components.text, matchedTerms: [...hit.components.text.matchedTerms] } : undefined,
        vector: hit.components.vector ? { ...hit.components.vector, metric } : undefined,
      },
      memory: this.toRecord(hit.document),
      score: hit.score,
    };
  }

  private toRecord(document: StoredMemory<Metadata>): MemoryRecord<Metadata> {
    if (document.schemaVersion !== MEMORY_RECORD_SCHEMA_VERSION) {
      throw new Error(`Unsupported memory record schema version: ${String(document.schemaVersion)}`);
    }
    return {
      category: document.category,
      content: document.content,
      createdAt: document.createdAt,
      ...(document.embedding === undefined ? {} : { embedding: [...document.embedding] }),
      ...(document.embeddingProvenance === undefined
        ? {}
        : { embeddingProvenance: { ...document.embeddingProvenance } }),
      ...(document.expiresAt === undefined ? {} : { expiresAt: document.expiresAt }),
      id: document._id,
      ...(document.metadata === undefined ? {} : { metadata: clone(document.metadata) }),
      schemaVersion: MEMORY_RECORD_SCHEMA_VERSION,
      updatedAt: document.updatedAt,
    };
  }

  private toStoredDocument(memory: MemoryRecord<Metadata>): StoredMemoryDocument<Metadata> {
    return {
      category: memory.category,
      content: memory.content,
      createdAt: memory.createdAt,
      ...(memory.embedding === undefined ? {} : { embedding: [...memory.embedding] }),
      ...(memory.embeddingProvenance === undefined
        ? {}
        : { embeddingProvenance: { ...memory.embeddingProvenance } }),
      ...(memory.expiresAt === undefined ? {} : { expiresAt: memory.expiresAt }),
      ...(memory.metadata === undefined ? {} : { metadata: clone(memory.metadata) }),
      schemaVersion: MEMORY_RECORD_SCHEMA_VERSION,
      updatedAt: memory.updatedAt,
    };
  }
}

export const createMemoryStore = CamaMemory.create;
