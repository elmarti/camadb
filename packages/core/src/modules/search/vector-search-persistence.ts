import sift from 'sift';
import { CacheStats } from '../../interfaces/cache.interface';
import { ICollectionMeta } from '../../interfaces/collection-meta.interface';
import {
  IPersistenceAdapter,
  RecordMutation,
  StorageStats,
} from '../../interfaces/persistence-adapter.interface';
import { TextSearchHit, TextSearchOptions } from '../../interfaces/text-search.interface';
import {
  VectorIndexConfig,
  VectorMetric,
  VectorSearchHit,
  VectorSearchOptions,
} from '../../interfaces/vector-search.interface';

const DEFAULT_LIMIT = 10;
const FETCH_BATCH = 512;

interface Candidate {
  document: any;
  score: number;
  sequence: number;
}

/** A binary heap whose root is the worst retained candidate. */
class TopK {
  private readonly values: Candidate[] = [];

  constructor(private readonly limit: number) {}

  add(document: any, score: number, sequence: number): void {
    if (this.values.length === this.limit) {
      const worst = this.values[0];
      if (score < worst.score || (score === worst.score && sequence > worst.sequence)) return;
    }
    const candidate = { document, score, sequence };
    if (this.values.length < this.limit) {
      this.values.push(candidate);
      this.up(this.values.length - 1);
      return;
    }
    this.values[0] = candidate;
    this.down(0);
  }

  sorted(): Candidate[] {
    return [...this.values].sort((left, right) =>
      right.score - left.score || left.sequence - right.sequence,
    );
  }

  private worseThan(left: Candidate, right: Candidate): boolean {
    return left.score < right.score || (left.score === right.score && left.sequence > right.sequence);
  }

  private up(start: number): void {
    let index = start;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!this.worseThan(this.values[index], this.values[parent])) break;
      [this.values[index], this.values[parent]] = [this.values[parent], this.values[index]];
      index = parent;
    }
  }

  private down(start: number): void {
    let index = start;
    while (index < this.values.length) {
      const left = index * 2 + 1;
      const right = left + 1;
      let worst = index;
      if (left < this.values.length && this.worseThan(this.values[left], this.values[worst])) worst = left;
      if (right < this.values.length && this.worseThan(this.values[right], this.values[worst])) worst = right;
      if (worst === index) return;
      [this.values[index], this.values[worst]] = [this.values[worst], this.values[index]];
      index = worst;
    }
  }
}

/** Bounded, exact vector scoring over authoritative committed records. */
export class VectorSearchPersistence implements IPersistenceAdapter {
  private readonly definitions = new Map<string, number>();
  private destroyed = false;
  private readonly initialized: Promise<void>;

  constructor(
    private readonly adapter: IPersistenceAdapter,
    collectionMeta: ICollectionMeta,
    configuredIndexes: VectorIndexConfig[],
  ) {
    this.initialized = collectionMeta.get().then(async (metadata) => {
      const definitions = metadata?.vectorIndexes ?? configuredIndexes;
      for (const definition of definitions) this.addDefinition(definition);
      if (metadata && metadata.vectorIndexes === undefined && configuredIndexes.length > 0) {
        await collectionMeta.update(metadata.collectionName, { ...metadata, vectorIndexes: configuredIndexes });
      }
    });
  }

  get recordsResident(): boolean { return this.adapter.recordsResident === true; }

  async searchVector(
    field: string,
    vector: readonly number[],
    options: VectorSearchOptions<any> = {},
  ): Promise<VectorSearchHit<any>[]> {
    this.checkDestroyed();
    await this.initialized;
    const dimensions = this.definitions.get(field);
    if (dimensions === undefined) throw new Error(`Vector search field "${field}" is not configured`);
    this.assertVector(vector, dimensions, `Vector query for "${field}"`);
    const metric = options.metric ?? 'cosine';
    if (!['cosine', 'dot', 'euclidean'].includes(metric)) throw new Error(`Unknown vector metric: ${String(metric)}`);
    const limit = options.limit ?? DEFAULT_LIMIT;
    if (!Number.isSafeInteger(limit) || limit < 0) {
      throw new Error('Vector search limit must be a non-negative integer');
    }
    if (limit === 0) return [];
    const queryMagnitude = metric === 'cosine' ? this.magnitudeSquared(vector) : undefined;
    if (queryMagnitude === 0) {
      throw new Error('Cosine vector query must have non-zero magnitude');
    }

    const filter = options.filter as Record<string, unknown> | undefined;
    const hasFilter = filter !== undefined && Object.keys(filter).length > 0;
    const top = new TopK(limit);
    let sequence = 0;
    const source = await this.candidates(hasFilter ? filter : undefined);
    const predicate = hasFilter && !source.filterApplied ? sift(filter!) : undefined;
    const records = source.records;
    const consider = (document: any): void => {
      const currentSequence = sequence++;
      if (predicate && !predicate(document)) return;
      const stored = document?.[field];
      if (stored === undefined || stored === null) return;
      const label = `Vector field "${field}" for document "${String(document?._id)}"`;
      this.assertVectorShape(stored, dimensions, label);
      top.add(document, this.score(vector, stored, metric, queryMagnitude, label), currentSequence);
    };
    if (Symbol.iterator in Object(records)) {
      for (const document of records as Iterable<any>) consider(document);
    } else {
      for await (const document of records as AsyncIterable<any>) consider(document);
    }
    return top.sorted().map(({ document, score }) => ({ document, score }));
  }

  async insert(rows: any[]): Promise<void> {
    await this.initialized;
    rows.forEach((row) => this.assertDocument(row));
    return this.adapter.insert(rows);
  }

  async update(rows: any[]): Promise<void> {
    await this.initialized;
    rows.forEach((row) => this.assertDocument(row));
    return this.adapter.update(rows);
  }

  async mutateRecords(mutation: RecordMutation): Promise<void> {
    await this.initialized;
    (mutation.puts ?? []).forEach((row) => this.assertDocument(row));
    return this.adapter.mutateRecords!(mutation);
  }

  searchText(query: string, options?: TextSearchOptions<any>): Promise<TextSearchHit<any>[]> {
    this.checkDestroyed();
    if (!this.adapter.searchText) return Promise.reject(new Error('Full-text search is unavailable'));
    return this.adapter.searchText(query, options);
  }

  queryRecords(query: Record<string, unknown>): Promise<any[] | undefined> {
    this.checkDestroyed();
    return this.adapter.queryRecords?.(query) ?? Promise.resolve(undefined);
  }
  queryExactRecords(query: Record<string, unknown>): Promise<any[] | undefined> {
    this.checkDestroyed();
    return this.adapter.queryExactRecords?.(query) ?? Promise.resolve(undefined);
  }
  queryRecordIds(query: Record<string, unknown>): Promise<string[] | undefined> {
    this.checkDestroyed();
    return this.adapter.queryRecordIds?.(query) ?? Promise.resolve(undefined);
  }
  getData(): Promise<any> { this.checkDestroyed(); return this.adapter.getData(); }
  getRecord(id: string): Promise<any | undefined> { this.checkDestroyed(); return this.adapter.getRecord!(id); }
  getRecords(ids: string[]): Promise<Map<string, any>> { this.checkDestroyed(); return this.adapter.getRecords!(ids); }
  iterateRecords(): AsyncIterable<any> { this.checkDestroyed(); return this.adapter.iterateRecords!(); }
  cacheRevision(): Promise<string> { this.checkDestroyed(); return this.adapter.cacheRevision!(); }
  initializeCache(): Promise<void> { this.checkDestroyed(); return this.adapter.initializeCache?.() ?? Promise.resolve(); }
  cacheStats(): CacheStats { this.checkDestroyed(); return this.adapter.cacheStats!(); }
  clearCache(): void { this.checkDestroyed(); this.adapter.clearCache?.(); }
  compact(): Promise<void> { this.checkDestroyed(); return this.adapter.compact?.() ?? Promise.resolve(); }
  storageStats(): Promise<StorageStats> { this.checkDestroyed(); return this.adapter.storageStats!(); }

  async destroy(): Promise<void> {
    this.checkDestroyed();
    await this.adapter.destroy();
    this.destroyed = true;
  }

  private async candidates(filter?: Record<string, unknown>): Promise<{
    filterApplied: boolean;
    records: Iterable<any> | AsyncIterable<any>;
  }> {
    if (filter) {
      const exact = await this.adapter.queryExactRecords?.(filter);
      if (exact !== undefined) return { filterApplied: true, records: exact };
      if (this.adapter.recordsResident) {
        const records = await this.adapter.queryRecords?.(filter);
        if (records !== undefined) return { filterApplied: false, records };
      }
      const ids = await this.adapter.queryRecordIds?.(filter);
      if (ids !== undefined) return { filterApplied: false, records: this.recordsById(ids) };
      const records = await this.adapter.queryRecords?.(filter);
      if (records !== undefined) return { filterApplied: false, records };
    }
    if (this.adapter.recordsResident) return { filterApplied: false, records: await this.adapter.getData() };
    if (this.adapter.iterateRecords) return { filterApplied: false, records: this.adapter.iterateRecords() };
    return { filterApplied: false, records: await this.adapter.getData() };
  }

  private async *recordsById(ids: string[]): AsyncIterable<any> {
    if (!this.adapter.getRecords) {
      const wanted = new Set(ids);
      for await (const row of this.adapter.iterateRecords?.() ?? this.asAsync(await this.adapter.getData())) {
        if (wanted.has(row?._id)) yield row;
      }
      return;
    }
    for (let offset = 0; offset < ids.length; offset += FETCH_BATCH) {
      const batch = ids.slice(offset, offset + FETCH_BATCH);
      const records = await this.adapter.getRecords(batch);
      for (const id of batch) {
        const record = records.get(id);
        if (record !== undefined) yield record;
      }
    }
  }

  private async *asAsync(rows: Iterable<any>): AsyncIterable<any> {
    yield* rows;
  }

  private addDefinition(definition: VectorIndexConfig): void {
    if (!definition || typeof definition.field !== 'string' || definition.field.length === 0 ||
      definition.field === '_id' || definition.field.startsWith('$')) {
      throw new Error('Vector index fields must be non-empty document field names');
    }
    if (!Number.isSafeInteger(definition.dimensions) || definition.dimensions <= 0) {
      throw new Error(`Vector index "${definition.field}" dimensions must be a positive integer`);
    }
    if (this.definitions.has(definition.field)) throw new Error(`Duplicate vector index field: ${definition.field}`);
    this.definitions.set(definition.field, definition.dimensions);
  }

  private assertDocument(document: any): void {
    for (const [field, dimensions] of this.definitions) {
      const vector = document?.[field];
      if (vector !== undefined && vector !== null) {
        this.assertVector(vector, dimensions, `Vector field "${field}" for document "${String(document?._id)}"`);
      }
    }
  }

  private assertVector(value: unknown, dimensions: number, label: string): asserts value is readonly number[] {
    this.assertVectorShape(value, dimensions, label);
    if (value.some((component) => typeof component !== 'number' || !Number.isFinite(component))) {
      throw new Error(`${label} must contain only finite numbers`);
    }
  }

  private assertVectorShape(value: unknown, dimensions: number, label: string): asserts value is readonly number[] {
    if (!Array.isArray(value)) throw new Error(`${label} must be an array of finite numbers`);
    if (value.length !== dimensions) throw new Error(`${label} has dimension ${value.length}; expected ${dimensions}`);
  }

  private score(
    query: readonly number[],
    stored: readonly number[],
    metric: VectorMetric,
    queryMagnitudeSquared?: number,
    label?: string,
  ): number {
    let dot = 0;
    let storedMagnitude = 0;
    let squaredDistance = 0;
    for (let index = 0; index < query.length; index += 1) {
      if (typeof stored[index] !== 'number' || !Number.isFinite(stored[index])) {
        throw new Error(`${label ?? 'Stored vector'} must contain only finite numbers`);
      }
      dot += query[index] * stored[index];
      if (metric === 'cosine') {
        storedMagnitude += stored[index] ** 2;
      } else if (metric === 'euclidean') {
        squaredDistance += (query[index] - stored[index]) ** 2;
      }
    }
    if (metric === 'dot') return dot;
    if (metric === 'euclidean') return -Math.sqrt(squaredDistance) || 0;
    if (storedMagnitude === 0) return 0;
    return dot / Math.sqrt(queryMagnitudeSquared! * storedMagnitude);
  }

  private magnitudeSquared(vector: readonly number[]): number {
    return vector.reduce((total, component) => total + component ** 2, 0);
  }

  private checkDestroyed(): void {
    if (this.destroyed) throw new Error('Collection has been destroyed. Call Cama.initCollection to recreate');
  }
}
