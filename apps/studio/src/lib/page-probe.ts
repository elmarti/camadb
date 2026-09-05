import { STUDIO_PROTOCOL_VERSION } from './protocol';
import type {
  StudioCommand,
  StudioCommandResult,
  StudioCollectionSummary,
  StudioDatabaseSummary,
  StudioQuery,
  StudioQueryHit,
  StudioRecord,
  StudioProbeResponse,
} from './protocol';

interface RawStoredRecord {
  deleted?: boolean;
  generation?: number;
  sequence?: number;
  value?: Record<string, unknown>;
}

interface CollectionMetadata {
  columns?: unknown;
  indexes?: unknown;
  searchIndexes?: unknown;
  vectorIndexes?: unknown;
}

/**
 * Runs inside the inspected page. Keep every helper inside this function: its
 * source is serialized by the DevTools transport and cannot close over module
 * state. The probe only opens existing databases. Inspection is readonly;
 * explicit record actions use short readwrite transactions.
 */
export async function runStudioProbe(command: StudioCommand): Promise<StudioProbeResponse> {
  const protocol = 1 as const;
  const recordPrefix = 'record:';
  const recordEnd = `${recordPrefix}\uffff`;

  const fail = (error: unknown): StudioProbeResponse => ({
    protocol,
    error: error instanceof Error ? error.message : String(error),
  });
  const request = <T>(value: IDBRequest<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      value.onsuccess = () => resolve(value.result);
      value.onerror = () => reject(value.error ?? new Error('IndexedDB request failed'));
    });
  const complete = (transaction: IDBTransaction): Promise<void> =>
    new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    });
  const enumerate = async (): Promise<Array<{ name?: string; version?: number }>> => {
    const databases = (
      indexedDB as IDBFactory & {
        databases?: () => Promise<Array<{ name?: string; version?: number }>>;
      }
    ).databases;
    if (!databases) throw new Error('This browser does not support safe IndexedDB database discovery');
    return databases.call(indexedDB);
  };
  const openExisting = async (name: string): Promise<IDBDatabase> => {
    const known = await enumerate();
    if (!known.some((database) => database.name === name)) {
      throw new Error(`Database "${name}" does not exist in this page origin`);
    }
    return new Promise((resolve, reject) => {
      const opening = indexedDB.open(name);
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error ?? new Error(`Unable to open database "${name}"`));
      opening.onblocked = () => reject(new Error(`Database "${name}" is blocked by another connection`));
    });
  };
  const validVectorIndexes = (value: unknown): Array<{ field: string; dimensions: number }> =>
    Array.isArray(value)
      ? value.filter(
          (item): item is { field: string; dimensions: number } =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as { field?: unknown }).field === 'string' &&
            Number.isSafeInteger((item as { dimensions?: unknown }).dimensions),
        )
      : [];
  const validStrings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  const validObjects = (value: unknown): Array<Record<string, unknown>> =>
    Array.isArray(value)
      ? value.filter(
          (item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item),
        )
      : [];
  const collectionSummary = async (database: IDBDatabase, name: string): Promise<StudioCollectionSummary> => {
    const transaction = database.transaction(name, 'readonly');
    const done = complete(transaction);
    const store = transaction.objectStore(name);
    const collectionMeta = (await request(store.get('collection-metadata'))) as CollectionMetadata | undefined;
    const recordMeta = (await request(store.get('record-metadata'))) as { generation?: number } | undefined;
    let liveRecords = 0;
    let tombstones = 0;
    await new Promise<void>((resolve, reject) => {
      const cursorRequest = store.openCursor(IDBKeyRange.bound(recordPrefix, recordEnd));
      cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error('Unable to scan collection'));
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return resolve();
        if ((cursor.value as RawStoredRecord).deleted) tombstones += 1;
        else liveRecords += 1;
        cursor.continue();
      };
    });
    await done;
    return {
      name,
      generation: recordMeta?.generation,
      liveRecords,
      tombstones,
      columns: validObjects(collectionMeta?.columns),
      indexes: validStrings(collectionMeta?.indexes),
      searchIndexes: validStrings(collectionMeta?.searchIndexes),
      vectorIndexes: validVectorIndexes(collectionMeta?.vectorIndexes),
    };
  };
  const scanRecords = async (
    database: IDBDatabase,
    collection: string,
    after: string | undefined,
    limit: number,
  ): Promise<{ records: StudioRecord[]; nextCursor?: string; scanned: number }> => {
    if (!database.objectStoreNames.contains(collection)) throw new Error(`Collection "${collection}" does not exist`);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5000)
      throw new Error('Record limit must be between 1 and 5000');
    const transaction = database.transaction(collection, 'readonly');
    const done = complete(transaction);
    const store = transaction.objectStore(collection);
    const lower = after ?? recordPrefix;
    const range = IDBKeyRange.bound(lower, recordEnd, after !== undefined);
    const records: StudioRecord[] = [];
    let scanned = 0;
    let nextCursor: string | undefined;
    await new Promise<void>((resolve, reject) => {
      const cursorRequest = store.openCursor(range);
      cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error('Unable to read collection records'));
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return resolve();
        scanned += 1;
        const stored = cursor.value as RawStoredRecord;
        if (!stored.deleted && stored.value && records.length < limit) {
          records.push({
            cursor: String(cursor.key),
            document: stored.value,
            generation: stored.generation ?? 0,
            sequence: stored.sequence ?? 0,
          });
        }
        if (records.length >= limit) {
          nextCursor = String(cursor.key);
          return resolve();
        }
        cursor.continue();
      };
    });
    await done;
    return { records, nextCursor, scanned };
  };
  const pathValue = (document: Record<string, unknown>, path: string): unknown =>
    path
      .split('.')
      .reduce<unknown>(
        (value, part) =>
          typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[part] : undefined,
        document,
      );
  const matchesFilter = (document: Record<string, unknown>, filter: Record<string, unknown>): boolean =>
    Object.entries(filter).every(([field, expected]) => {
      const actual = pathValue(document, field);
      if (typeof expected !== 'object' || expected === null || Array.isArray(expected)) return actual === expected;
      return Object.entries(expected as Record<string, unknown>).every(([operator, operand]) => {
        if (operator === '$eq') return actual === operand;
        if (operator === '$ne') return actual !== operand;
        if (operator === '$gt') return (actual as number) > (operand as number);
        if (operator === '$gte') return (actual as number) >= (operand as number);
        if (operator === '$lt') return (actual as number) < (operand as number);
        if (operator === '$lte') return (actual as number) <= (operand as number);
        if (operator === '$in') return Array.isArray(operand) && operand.includes(actual);
        return false;
      });
    });
  const tokenize = (value: string): string[] =>
    value
      .toLocaleLowerCase()
      .normalize('NFKC')
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  const vectorScore = (left: number[], right: number[], metric: 'cosine' | 'dot' | 'euclidean'): number => {
    if (left.length === 0 || left.length !== right.length || right.some((item) => !Number.isFinite(item)))
      return -Infinity;
    let dot = 0;
    let leftMagnitude = 0;
    let rightMagnitude = 0;
    let distance = 0;
    for (let index = 0; index < left.length; index += 1) {
      const leftValue = left[index]!;
      const rightValue = right[index]!;
      dot += leftValue * rightValue;
      leftMagnitude += leftValue ** 2;
      rightMagnitude += rightValue ** 2;
      distance += (leftValue - rightValue) ** 2;
    }
    if (metric === 'dot') return dot;
    if (metric === 'euclidean') return -Math.sqrt(distance);
    if (leftMagnitude === 0 || rightMagnitude === 0) return -Infinity;
    return dot / Math.sqrt(leftMagnitude * rightMagnitude);
  };
  const scoreQuery = (
    document: Record<string, unknown>,
    query: StudioQuery,
    searchIndexes: string[],
  ): { matches: boolean; textScore?: number; vectorScore?: number; matchedTerms?: string[] } => {
    if (query.kind === 'document') return { matches: matchesFilter(document, query.filter) };
    const terms = query.kind === 'vector' ? [] : [...new Set(tokenize(query.text))];
    const corpus = searchIndexes.flatMap((field) => tokenize(String(pathValue(document, field) ?? '')));
    const matchedTerms = terms.filter((term) => corpus.includes(term));
    const textMatches =
      terms.length > 0 &&
      (query.kind !== 'text' || query.match !== 'all' ? matchedTerms.length > 0 : matchedTerms.length === terms.length);
    const textScore =
      terms.length === 0
        ? 0
        : matchedTerms.reduce((total, term) => total + corpus.filter((token) => token === term).length, 0) /
          terms.length;
    if (query.kind === 'text') return { matches: textMatches, textScore, matchedTerms };
    const stored = pathValue(document, query.field);
    const score =
      Array.isArray(stored) && stored.every((item) => typeof item === 'number')
        ? vectorScore(query.vector, stored as number[], query.metric ?? 'cosine')
        : -Infinity;
    if (query.kind === 'vector') return { matches: Number.isFinite(score), vectorScore: score };
    return {
      matches: textMatches || Number.isFinite(score),
      textScore: textMatches ? textScore : undefined,
      vectorScore: Number.isFinite(score) ? score : undefined,
      matchedTerms,
    };
  };
  const queryCollection = async (
    database: IDBDatabase,
    collection: string,
    query: StudioQuery,
    limit: number,
    scanLimit: number,
  ): Promise<{ hits: StudioQueryHit[]; scanned: number; truncated: boolean }> => {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
      throw new Error('Query limit must be between 1 and 1000');
    if (!Number.isSafeInteger(scanLimit) || scanLimit < limit || scanLimit > 100000) {
      throw new Error('Scan limit must be between the result limit and 100000');
    }
    const transaction = database.transaction(collection, 'readonly');
    const done = complete(transaction);
    const store = transaction.objectStore(collection);
    const collectionMeta = (await request(store.get('collection-metadata'))) as CollectionMetadata | undefined;
    const searchIndexes = validStrings(collectionMeta?.searchIndexes);
    if ((query.kind === 'text' || query.kind === 'hybrid') && searchIndexes.length === 0) {
      throw new Error('This collection has no configured full-text fields');
    }
    const candidates: Array<StudioQueryHit & { textScore?: number; vectorScore?: number }> = [];
    let scanned = 0;
    let truncated = false;
    await new Promise<void>((resolve, reject) => {
      const cursorRequest = store.openCursor(IDBKeyRange.bound(recordPrefix, recordEnd));
      cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error('Unable to query collection'));
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return resolve();
        if (scanned >= scanLimit) {
          truncated = true;
          return resolve();
        }
        scanned += 1;
        const stored = cursor.value as RawStoredRecord;
        if (!stored.deleted && stored.value) {
          const scored = scoreQuery(stored.value, query, searchIndexes);
          if (scored.matches) {
            candidates.push({
              document: stored.value,
              score: scored.textScore ?? scored.vectorScore ?? 1,
              textScore: scored.textScore,
              vectorScore: scored.vectorScore,
              explanation: {
                matchedTerms: scored.matchedTerms,
                textScore: scored.textScore,
                vectorScore: scored.vectorScore,
              },
            });
          }
        }
        cursor.continue();
      };
    });
    await done;
    if (query.kind === 'hybrid') {
      const textRanked = candidates
        .filter((hit) => hit.textScore !== undefined)
        .sort((a, b) => b.textScore! - a.textScore!);
      const vectorRanked = candidates
        .filter((hit) => hit.vectorScore !== undefined)
        .sort((a, b) => b.vectorScore! - a.vectorScore!);
      const textWeight = query.textWeight ?? 1;
      const vectorWeight = query.vectorWeight ?? 1;
      candidates.forEach((hit) => {
        const textRank = textRanked.indexOf(hit) + 1;
        const vectorRank = vectorRanked.indexOf(hit) + 1;
        hit.explanation.textRank = textRank || undefined;
        hit.explanation.vectorRank = vectorRank || undefined;
        hit.score = (textRank ? textWeight / (60 + textRank) : 0) + (vectorRank ? vectorWeight / (60 + vectorRank) : 0);
      });
    }
    candidates.sort(
      (left, right) => right.score - left.score || String(left.document._id).localeCompare(String(right.document._id)),
    );
    return { hits: candidates.slice(0, limit), scanned, truncated };
  };
  const mutateRecord = async (
    database: IDBDatabase,
    collection: string,
    action: 'replace' | 'delete',
    id: string,
    expectedGeneration: number,
    document?: Record<string, unknown>,
  ): Promise<{ action: 'replace' | 'delete'; id: string; generation: number; changed: boolean }> => {
    if (!database.objectStoreNames.contains(collection)) throw new Error(`Collection "${collection}" does not exist`);
    if (!id) throw new Error('Record identity must be a non-empty string');
    if (action === 'replace' && (!document || document._id !== id)) {
      throw new Error('Replacement document must preserve its string _id');
    }
    const transaction = database.transaction(collection, 'readwrite');
    const done = complete(transaction);
    const store = transaction.objectStore(collection);
    const metadata = (await request(store.get('record-metadata'))) as
      { camaDB?: { format?: string; version?: number }; generation?: number; nextSequence?: number } | undefined;
    if (metadata?.camaDB?.format !== 'records' || metadata.camaDB.version !== 3) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error('Studio mutations require a CamaDB version-3 record store');
    }
    const key = `${recordPrefix}${id}`;
    const previous = (await request(store.get(key))) as RawStoredRecord | undefined;
    if (!Number.isSafeInteger(expectedGeneration) || previous?.generation !== expectedGeneration) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error('This record changed after Studio loaded it; refresh before mutating it');
    }
    const generation = (metadata.generation ?? 0) + 1;
    const wasLive = Boolean(previous && !previous.deleted && previous.value);
    if (action === 'delete') {
      if (wasLive) {
        await request(store.put({ deleted: true, generation, sequence: previous?.sequence ?? 0 }, key));
        await request(store.put({ ...metadata, generation }, 'record-metadata'));
      }
      await done;
      return { action, id, generation: wasLive ? generation : (metadata.generation ?? 0), changed: wasLive };
    }
    const nextSequence = metadata.nextSequence ?? 0;
    const sequence = previous?.sequence ?? nextSequence;
    await request(store.put({ generation, sequence, value: document }, key));
    await request(
      store.put(
        {
          ...metadata,
          generation,
          nextSequence: previous ? nextSequence : nextSequence + 1,
        },
        'record-metadata',
      ),
    );
    await done;
    return { action, id, generation, changed: true };
  };

  let database: IDBDatabase | undefined;
  try {
    if (command.type === 'list-databases') {
      const databases: StudioDatabaseSummary[] = (await enumerate())
        .filter((item): item is { name: string; version?: number } => typeof item.name === 'string')
        .map((item) => ({ name: item.name, version: item.version }))
        .sort((left, right) => left.name.localeCompare(right.name));
      return { protocol, result: { type: 'databases', databases } };
    }
    database = await openExisting(command.database);
    let result: StudioCommandResult;
    if (command.type === 'inspect-database') {
      const collections: StudioCollectionSummary[] = [];
      for (const name of Array.from(database.objectStoreNames)) {
        try {
          const summary = await collectionSummary(database, name);
          if (summary.generation !== undefined) collections.push(summary);
        } catch {
          // Ignore unrelated object stores in a mixed-origin database.
        }
      }
      result = {
        type: 'database',
        database: { name: database.name, version: database.version },
        collections,
      };
    } else if (command.type === 'read-records') {
      result = { type: 'records', ...(await scanRecords(database, command.collection, command.after, command.limit)) };
    } else if (command.type === 'replace-record') {
      result = {
        type: 'mutation',
        ...(await mutateRecord(
          database,
          command.collection,
          'replace',
          command.id,
          command.expectedGeneration,
          command.document,
        )),
      };
    } else if (command.type === 'delete-record') {
      result = {
        type: 'mutation',
        ...(await mutateRecord(database, command.collection, 'delete', command.id, command.expectedGeneration)),
      };
    } else {
      result = {
        type: 'query',
        ...(await queryCollection(database, command.collection, command.query, command.limit, command.scanLimit)),
      };
    }
    return { protocol, result };
  } catch (error) {
    return fail(error);
  } finally {
    database?.close();
  }
}

export function createProbeExpression(command: StudioCommand, requestId: string): string {
  const commandJson = JSON.stringify(command).replaceAll('<', '\\u003c');
  const requestJson = JSON.stringify(requestId);
  return `(() => {
    const key = '__CAMADB_STUDIO_RESULTS__';
    const root = globalThis;
    if (!root[key]) Object.defineProperty(root, key, { value: Object.create(null), configurable: true });
    const run = (${runStudioProbe.toString()});
    Promise.resolve(run(${commandJson})).then(
      value => { root[key][${requestJson}] = { ready: true, value }; },
      error => { root[key][${requestJson}] = { ready: true, value: { protocol: ${STUDIO_PROTOCOL_VERSION}, error: String(error) } }; }
    );
    return { accepted: true, protocol: ${STUDIO_PROTOCOL_VERSION} };
  })()`;
}

export function createProbePollExpression(requestId: string): string {
  const requestJson = JSON.stringify(requestId);
  return `(() => {
    const results = globalThis.__CAMADB_STUDIO_RESULTS__;
    if (!results || !results[${requestJson}]) return { ready: false };
    const response = results[${requestJson}];
    delete results[${requestJson}];
    return response;
  })()`;
}
