import { CacheStats } from '../../interfaces/cache.interface';
import { ICollectionMeta } from '../../interfaces/collection-meta.interface';
import {
  IPersistenceAdapter,
  RecordMutation,
  StorageStats,
} from '../../interfaces/persistence-adapter.interface';

type IndexValue = string | number | boolean | null;

interface Bucket {
  ids: Set<string>;
  value: IndexValue;
}

const isIndexValue = (value: unknown): value is IndexValue =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'boolean' ||
  (typeof value === 'number' && Number.isFinite(value));

const valueKey = (value: IndexValue): string => `${value === null ? 'null' : typeof value}:${String(value)}`;

const compareValues = (left: IndexValue, right: IndexValue): number => {
  const leftType = left === null ? 'null' : typeof left;
  const rightType = right === null ? 'null' : typeof right;
  if (leftType !== rightType) return leftType.localeCompare(rightType);
  if (left === right) return 0;
  return (left as string | number | boolean) < (right as string | number | boolean) ? -1 : 1;
};

class FieldIndex {
  private buckets = new Map<string, Bucket>();
  private ordered?: Bucket[];

  add(id: string, value: unknown): void {
    if (!isIndexValue(value)) return;
    const key = valueKey(value);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { ids: new Set(), value };
      this.buckets.set(key, bucket);
      this.ordered = undefined;
    }
    bucket.ids.add(id);
  }

  remove(id: string, value: unknown): void {
    if (!isIndexValue(value)) return;
    const key = valueKey(value);
    const bucket = this.buckets.get(key);
    if (!bucket) return;
    bucket.ids.delete(id);
    if (bucket.ids.size === 0) {
      this.buckets.delete(key);
      this.ordered = undefined;
    }
  }

  match(condition: unknown): Set<string> | undefined {
    if (isIndexValue(condition)) return new Set(this.buckets.get(valueKey(condition))?.ids ?? []);
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return;
    const operators = condition as Record<string, unknown>;
    const matches: Set<string>[] = [];
    if ('$eq' in operators && isIndexValue(operators.$eq)) {
      matches.push(new Set(this.buckets.get(valueKey(operators.$eq))?.ids ?? []));
    }
    const range = this.range(operators);
    if (range) matches.push(range);
    if (matches.length === 0) return;
    return matches.slice(1).reduce((result, current) => this.intersect(result, current), matches[0]);
  }

  private range(operators: Record<string, unknown>): Set<string> | undefined {
    const lower = '$gt' in operators ? { value: operators.$gt, inclusive: false } :
      '$gte' in operators ? { value: operators.$gte, inclusive: true } : undefined;
    const upper = '$lt' in operators ? { value: operators.$lt, inclusive: false } :
      '$lte' in operators ? { value: operators.$lte, inclusive: true } : undefined;
    if ((!lower && !upper) || (lower && !isIndexValue(lower.value)) || (upper && !isIndexValue(upper.value))) return;
    const boundTypes = [lower?.value, upper?.value]
      .filter((value): value is IndexValue => isIndexValue(value))
      .map((value) => value === null ? 'null' : typeof value);
    const bucketTypes = new Set([...this.buckets.values()].map(({ value }) => value === null ? 'null' : typeof value));
    // JavaScript range comparisons coerce mixed scalar types. A type-sorted index cannot
    // safely narrow those queries, so retain the scan path instead.
    if (new Set(boundTypes).size > 1 || [...bucketTypes].some((type) => type !== boundTypes[0])) return;
    const ordered = this.sortedBuckets();
    const start = lower ? this.bound(ordered, lower.value as IndexValue, !lower.inclusive) : 0;
    const end = upper ? this.bound(ordered, upper.value as IndexValue, upper.inclusive) : ordered.length;
    const ids = new Set<string>();
    for (let index = start; index < end; index += 1) {
      for (const id of ordered[index].ids) ids.add(id);
    }
    return ids;
  }

  /** First bucket greater than target when afterEqual, otherwise first equal-or-greater bucket. */
  private bound(ordered: Bucket[], target: IndexValue, afterEqual: boolean): number {
    let low = 0;
    let high = ordered.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const comparison = compareValues(ordered[middle].value, target);
      if (comparison < 0 || (afterEqual && comparison === 0)) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  private sortedBuckets(): Bucket[] {
    if (!this.ordered) this.ordered = [...this.buckets.values()].sort((left, right) => compareValues(left.value, right.value));
    return this.ordered;
  }

  private intersect(left: Set<string>, right: Set<string>): Set<string> {
    const [smallest, largest] = left.size <= right.size ? [left, right] : [right, left];
    return new Set([...smallest].filter((id) => largest.has(id)));
  }
}

/** Derived metadata indexes. Committed records remain the authority and can always rebuild them. */
export class MetadataIndexedPersistence implements IPersistenceAdapter {
  private readonly indexes = new Map<string, FieldIndex>();
  private readonly indexedValues = new Map<string, Map<string, unknown>>();
  private readonly order = new Map<string, number>();
  private built = false;
  private destroyed = false;
  private nextSequence = 0;
  private revision?: string;
  private readonly initialized: Promise<void>;

  constructor(
    private readonly adapter: IPersistenceAdapter,
    collectionMeta: ICollectionMeta,
    configuredIndexes: string[],
  ) {
    this.initialized = collectionMeta.get().then((metadata) => {
      const definitions = metadata?.indexes ?? configuredIndexes;
      for (const field of definitions) {
        if (typeof field !== 'string' || field.length === 0 || field.startsWith('$')) {
          throw new Error('Metadata index fields must be non-empty document field names');
        }
        if (!this.indexes.has(field) && field !== '_id') this.indexes.set(field, new FieldIndex());
      }
    });
  }

  get recordsResident(): boolean { return this.adapter.recordsResident === true; }

  async queryRecords(query: Record<string, unknown>): Promise<any[] | undefined> {
    const ids = await this.queryRecordIds(query);
    if (ids === undefined) return;
    if (ids.length === 0) return [];
    if (this.adapter.getRecords) {
      const records = await this.adapter.getRecords(ids);
      return ids.map((id) => records.get(id)).filter((row) => row !== undefined);
    }
    const wanted = new Set(ids);
    return (await this.adapter.getData()).filter((row: { _id?: string }) => wanted.has(row._id ?? ''));
  }

  async queryExactRecords(query: Record<string, unknown>): Promise<any[] | undefined> {
    await this.initialized;
    if (!this.isFullyIndexed(query)) return;
    return this.queryRecords(query);
  }

  async queryRecordIds(query: Record<string, unknown>): Promise<string[] | undefined> {
    this.checkDestroyed();
    await this.initialized;
    if (!this.hasCandidateConstraint(query)) return;
    await this.ensureFresh();
    const candidates: Set<string>[] = [];
    this.collectCandidates(query, candidates);
    if (candidates.length === 0) return;
    const orderedSets = candidates.sort((left, right) => left.size - right.size);
    const ids = [...orderedSets[0]].filter((id) => orderedSets.slice(1).every((set) => set.has(id)));
    ids.sort((left, right) => (this.order.get(left) ?? Infinity) - (this.order.get(right) ?? Infinity));
    return ids;
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
    this.clearIndexes();
    this.destroyed = true;
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
    await this.initialized;
    const revision = await this.readRevision();
    if (this.built && revision === this.revision) return;
    await this.rebuildFromStorage();
    const after = await this.readRevision();
    if (revision !== undefined && after !== revision) await this.rebuildFromStorage();
    this.revision = await this.readRevision();
  }

  private async rebuildFromStorage(): Promise<void> {
    this.clearIndexes();
    const records = this.adapter.iterateRecords ? this.adapter.iterateRecords() : await this.adapter.getData();
    for await (const row of records as AsyncIterable<any> | Iterable<any>) this.put(row);
    this.built = true;
  }

  private rebuildRows(rows: any[]): void {
    this.clearIndexes();
    rows.forEach((row) => this.put(row));
    this.built = true;
  }

  private put(row: any): void {
    const id = row?._id;
    if (typeof id !== 'string') return;
    const existing = this.indexedValues.get(id);
    const sequence = this.order.get(id);
    if (existing) this.remove(id);
    const values = new Map<string, unknown>();
    for (const [field, index] of this.indexes) {
      const value = row[field];
      values.set(field, value);
      index.add(id, value);
    }
    this.indexedValues.set(id, values);
    this.order.set(id, sequence ?? this.nextSequence++);
  }

  private remove(id: string): void {
    const values = this.indexedValues.get(id);
    if (!values) return;
    for (const [field, value] of values) this.indexes.get(field)?.remove(id, value);
    this.indexedValues.delete(id);
    this.order.delete(id);
  }

  private collectCandidates(query: Record<string, unknown>, candidates: Set<string>[]): void {
    for (const [field, condition] of Object.entries(query)) {
      if (field === '$and' && Array.isArray(condition)) {
        for (const child of condition) {
          if (child && typeof child === 'object' && !Array.isArray(child)) {
            this.collectCandidates(child as Record<string, unknown>, candidates);
          }
        }
        continue;
      }
      const matches = this.indexes.get(field)?.match(condition);
      if (matches) candidates.push(matches);
    }
  }

  private hasCandidateConstraint(query: Record<string, unknown>): boolean {
    return Object.entries(query).some(([field, condition]) => {
      if (field === '$and' && Array.isArray(condition)) {
        return condition.some((child) => child !== null && typeof child === 'object' && !Array.isArray(child) &&
          this.hasCandidateConstraint(child as Record<string, unknown>));
      }
      return this.indexes.has(field) && this.indexes.get(field)?.match(condition) !== undefined;
    });
  }

  private isFullyIndexed(query: Record<string, unknown>): boolean {
    const entries = Object.entries(query);
    return entries.length > 0 && entries.every(([field, condition]) => {
      if (field === '$and' && Array.isArray(condition) && condition.length > 0) {
        return condition.every((child) => child !== null && typeof child === 'object' && !Array.isArray(child) &&
          this.isFullyIndexed(child as Record<string, unknown>));
      }
      return this.indexes.has(field) && this.isExactCondition(condition) &&
        this.indexes.get(field)?.match(condition) !== undefined;
    });
  }

  private isExactCondition(condition: unknown): boolean {
    if (isIndexValue(condition)) return true;
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return false;
    const operators = condition as Record<string, unknown>;
    const keys = Object.keys(operators);
    if (keys.length === 0 || keys.some((key) => !['$eq', '$gt', '$gte', '$lt', '$lte'].includes(key))) return false;
    if ('$gt' in operators && '$gte' in operators) return false;
    if ('$lt' in operators && '$lte' in operators) return false;
    return Object.values(operators).every(isIndexValue);
  }

  private clearIndexes(): void {
    for (const field of this.indexes.keys()) this.indexes.set(field, new FieldIndex());
    this.indexedValues.clear();
    this.order.clear();
    this.nextSequence = 0;
    this.built = false;
  }

  private readRevision(): Promise<string | undefined> {
    return this.adapter.cacheRevision ? this.adapter.cacheRevision() : Promise.resolve(undefined);
  }

  private checkDestroyed(): void {
    if (this.destroyed) throw new Error('Collection has been destroyed. Call Cama.initCollection to recreate');
  }
}
