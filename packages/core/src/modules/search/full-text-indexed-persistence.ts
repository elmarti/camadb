import sift from 'sift';
import { CacheStats } from '../../interfaces/cache.interface';
import { ICollectionMeta } from '../../interfaces/collection-meta.interface';
import {
  IPersistenceAdapter,
  RecordMutation,
  StorageStats,
} from '../../interfaces/persistence-adapter.interface';
import { TextSearchHit, TextSearchOptions } from '../../interfaces/text-search.interface';

const K1 = 1.2;
const B = 0.75;
const DEFAULT_LIMIT = 20;
const FETCH_BATCH = 512;

interface IndexedDocument {
  length: number;
  sequence: number;
  terms: Map<string, number>;
}

interface RankedCandidate {
  id: string;
  matchedTerms: string[];
  score: number;
  sequence: number;
}

export const tokenizeText = (value: string): string[] =>
  value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** Rebuildable in-memory keyword index over authoritative committed records. */
export class FullTextIndexedPersistence implements IPersistenceAdapter {
  private readonly documents = new Map<string, IndexedDocument>();
  private readonly fields: string[] = [];
  private readonly postings = new Map<string, Map<string, number>>();
  private built = false;
  private destroyed = false;
  private nextSequence = 0;
  private revision?: string;
  private totalDocumentLength = 0;
  private readonly initialized: Promise<void>;

  constructor(
    private readonly adapter: IPersistenceAdapter,
    collectionMeta: ICollectionMeta,
    configuredFields: string[],
  ) {
    this.initialized = collectionMeta.get().then(async (metadata) => {
      const definitions = metadata?.searchIndexes ?? configuredFields;
      for (const field of definitions) {
        if (typeof field !== 'string' || field.length === 0 || field.startsWith('$')) {
          throw new Error('Full-text index fields must be non-empty document field names');
        }
        if (!this.fields.includes(field) && field !== '_id') this.fields.push(field);
      }
      if (metadata && metadata.searchIndexes === undefined && configuredFields.length > 0) {
        await collectionMeta.update(metadata.collectionName, { ...metadata, searchIndexes: configuredFields });
      }
    });
  }

  get recordsResident(): boolean { return this.adapter.recordsResident === true; }

  async searchText(query: string, options: TextSearchOptions<any> = {}): Promise<TextSearchHit<any>[]> {
    this.checkDestroyed();
    await this.initialized;
    if (this.fields.length === 0) {
      throw new Error('Full-text search requires at least one configured searchIndexes field');
    }
    const queryTerms = [...new Set(tokenizeText(query))];
    if (queryTerms.length === 0) return [];
    const match = options.match ?? 'any';
    if (match !== 'all' && match !== 'any') throw new Error('Text search match must be "all" or "any"');
    const offset = this.nonNegativeInteger(options.offset ?? 0, 'offset');
    const limit = this.nonNegativeInteger(options.limit ?? DEFAULT_LIMIT, 'limit');
    if (limit === 0) return [];

    await this.ensureFresh();
    let candidateIds = this.candidateIds(queryTerms, match);
    if (candidateIds.size === 0) return [];

    let prefetched: Map<string, any> | undefined;
    const filter = options.filter as Record<string, unknown> | undefined;
    if (filter && Object.keys(filter).length > 0) {
      const indexedIds = await this.adapter.queryRecordIds?.(filter);
      if (indexedIds !== undefined) {
        const allowed = new Set(indexedIds);
        candidateIds = new Set([...candidateIds].filter((id) => allowed.has(id)));
      } else if (this.adapter.queryRecords) {
        const candidates = await this.adapter.queryRecords(filter);
        if (candidates !== undefined) {
          prefetched = new Map(candidates.map((row) => [row._id, row]));
          candidateIds = new Set([...candidateIds].filter((id) => prefetched!.has(id)));
        }
      }
    }

    const ranked = this.rank(candidateIds, queryTerms);
    const predicate = filter && Object.keys(filter).length > 0 ? sift(filter) : undefined;
    const hits: TextSearchHit<any>[] = [];
    let skipped = 0;
    const requested = Math.min(ranked.length, offset + limit);
    const bulkRecords = prefetched ?? (requested > FETCH_BATCH
      ? await this.fetchCandidateScan(new Set(ranked.map(({ id }) => id)))
      : undefined);
    for (let start = 0; start < ranked.length && hits.length < limit; start += FETCH_BATCH) {
      const batch = ranked.slice(start, start + FETCH_BATCH);
      const records = bulkRecords ?? await this.fetchRecords(batch.map(({ id }) => id));
      for (const candidate of batch) {
        const document = records.get(candidate.id);
        if (!document || (predicate && !predicate(document))) continue;
        if (skipped < offset) {
          skipped += 1;
          continue;
        }
        hits.push({ document, matchedTerms: candidate.matchedTerms, score: candidate.score });
        if (hits.length === limit) break;
      }
    }
    return hits;
  }

  async insert(rows: any[]): Promise<void> {
    await this.write(() => this.adapter.insert(rows), () => rows.forEach((row) => this.put(row)));
  }

  async update(rows: any[]): Promise<void> {
    await this.write(() => this.adapter.update(rows), () => this.rebuildRows(rows));
  }

  async mutateRecords(mutation: RecordMutation): Promise<void> {
    await this.write(
      () => this.adapter.mutateRecords!(mutation),
      () => {
        for (const id of mutation.deletes ?? []) this.remove(id);
        for (const row of mutation.puts ?? []) this.put(row);
      },
    );
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
  compact(): Promise<void> { return this.write(() => this.adapter.compact?.() ?? Promise.resolve(), () => undefined); }
  storageStats(): Promise<StorageStats> { this.checkDestroyed(); return this.adapter.storageStats!(); }

  async destroy(): Promise<void> {
    this.checkDestroyed();
    await this.adapter.destroy();
    this.clearIndex();
    this.destroyed = true;
  }

  private candidateIds(queryTerms: string[], match: 'all' | 'any'): Set<string> {
    const lists = queryTerms.map((term) => this.postings.get(term));
    if (match === 'all') {
      if (lists.some((posting) => !posting)) return new Set();
      const ordered = (lists as Map<string, number>[]).sort((left, right) => left.size - right.size);
      return new Set([...ordered[0].keys()].filter((id) => ordered.slice(1).every((posting) => posting.has(id))));
    }
    const ids = new Set<string>();
    for (const posting of lists) if (posting) for (const id of posting.keys()) ids.add(id);
    return ids;
  }

  private rank(candidateIds: Set<string>, queryTerms: string[]): RankedCandidate[] {
    const averageLength = this.totalDocumentLength / this.documents.size || 1;
    const totalDocuments = this.documents.size;
    const ranked: RankedCandidate[] = [];
    for (const id of candidateIds) {
      const document = this.documents.get(id);
      if (!document) continue;
      let score = 0;
      const matchedTerms: string[] = [];
      for (const term of queryTerms) {
        const frequency = document.terms.get(term) ?? 0;
        if (frequency === 0) continue;
        matchedTerms.push(term);
        const occurrences = this.postings.get(term)?.size ?? 0;
        const inverseFrequency = Math.log(1 + (totalDocuments - occurrences + 0.5) / (occurrences + 0.5));
        score += inverseFrequency *
          (frequency * (K1 + 1)) /
          (frequency + K1 * (1 - B + B * document.length / averageLength));
      }
      ranked.push({ id, matchedTerms, score, sequence: document.sequence });
    }
    return ranked.sort((left, right) => right.score - left.score || left.sequence - right.sequence);
  }

  private async fetchRecords(ids: string[]): Promise<Map<string, any>> {
    if (this.adapter.getRecords) return this.adapter.getRecords(ids);
    const wanted = new Set(ids);
    return new Map((await this.adapter.getData())
      .filter((row: { _id?: string }) => wanted.has(row._id ?? ''))
      .map((row: { _id: string }) => [row._id, row]));
  }

  private async fetchCandidateScan(wanted: Set<string>): Promise<Map<string, any>> {
    const records = new Map<string, any>();
    const source = this.adapter.iterateRecords ? this.adapter.iterateRecords() : await this.adapter.getData();
    for await (const row of source as AsyncIterable<any> | Iterable<any>) {
      if (wanted.has(row?._id)) records.set(row._id, row);
    }
    return records;
  }

  private async write(operation: () => Promise<void>, updateIndex: () => void): Promise<void> {
    this.checkDestroyed();
    await this.initialized;
    if (this.built) await this.ensureFresh();
    await operation();
    if (this.built) updateIndex();
    this.revision = await this.readRevision();
  }

  private async ensureFresh(): Promise<void> {
    const revision = await this.readRevision();
    if (this.built && revision === this.revision) return;
    await this.rebuildFromStorage();
    const after = await this.readRevision();
    if (revision !== undefined && after !== revision) await this.rebuildFromStorage();
    this.revision = await this.readRevision();
  }

  private async rebuildFromStorage(): Promise<void> {
    this.clearIndex();
    const records = this.adapter.iterateRecords ? this.adapter.iterateRecords() : await this.adapter.getData();
    for await (const row of records as AsyncIterable<any> | Iterable<any>) this.put(row);
    this.built = true;
  }

  private rebuildRows(rows: any[]): void {
    this.clearIndex();
    rows.forEach((row) => this.put(row));
    this.built = true;
  }

  private put(row: any): void {
    const id = row?._id;
    if (typeof id !== 'string') return;
    const previous = this.documents.get(id);
    const sequence = previous?.sequence;
    if (previous) this.remove(id);
    const tokens = this.fields.flatMap((field) => typeof row[field] === 'string' ? tokenizeText(row[field]) : []);
    const terms = new Map<string, number>();
    for (const token of tokens) terms.set(token, (terms.get(token) ?? 0) + 1);
    const document = { length: tokens.length, sequence: sequence ?? this.nextSequence++, terms };
    this.documents.set(id, document);
    this.totalDocumentLength += document.length;
    for (const [term, frequency] of terms) {
      let posting = this.postings.get(term);
      if (!posting) {
        posting = new Map();
        this.postings.set(term, posting);
      }
      posting.set(id, frequency);
    }
  }

  private remove(id: string): void {
    const document = this.documents.get(id);
    if (!document) return;
    for (const term of document.terms.keys()) {
      const posting = this.postings.get(term);
      posting?.delete(id);
      if (posting?.size === 0) this.postings.delete(term);
    }
    this.totalDocumentLength -= document.length;
    this.documents.delete(id);
  }

  private clearIndex(): void {
    this.documents.clear();
    this.postings.clear();
    this.totalDocumentLength = 0;
    this.nextSequence = 0;
    this.built = false;
  }

  private nonNegativeInteger(value: number, name: string): number {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Text search ${name} must be a non-negative integer`);
    return value;
  }

  private readRevision(): Promise<string | undefined> {
    return this.adapter.cacheRevision ? this.adapter.cacheRevision() : Promise.resolve(undefined);
  }

  private checkDestroyed(): void {
    if (this.destroyed) throw new Error('Collection has been destroyed. Call Cama.initCollection to recreate');
  }
}
