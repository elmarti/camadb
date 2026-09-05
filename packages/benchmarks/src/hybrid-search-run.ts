import { strict as assert } from 'assert';
import {
  Cama,
  HybridSearchHit,
  ICollection,
  PersistenceAdapterEnum,
  StoredDocument,
  TextSearchHit,
  VectorSearchHit,
} from '@camadb/core';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { AdapterName, parseConfig } from './config';

const DIMENSIONS = 32;
const LIMIT = 10;
const CANDIDATE_LIMIT = 50;
const RANK_CONSTANT = 60;

interface HybridDocument {
  _id: string;
  body: string;
  category: number;
  embedding: number[];
}

type StoredHybridDocument = StoredDocument<HybridDocument>;
type Engine = 'concurrent' | 'manual' | 'native';
type Operation = 'cold-balanced' | 'balanced' | 'metadata-filtered' | 'text-weighted';

interface Sample {
  heapDeltaBytes: number;
  milliseconds: number;
  perOperationMs: number;
}

const embedding = (seed: number): number[] => Array.from({ length: DIMENSIONS }, (_, dimension) =>
  Math.sin(seed * 0.017 + dimension * 0.31) + Math.cos(seed * 0.013 - dimension * 0.19),
);

const documents = (count: number): HybridDocument[] => Array.from({ length: count }, (_, index) => ({
  _id: String(index),
  body: index % 1_000 === 17 ? 'cobalt harbor durable local record' :
    index % 100 === 17 ? 'cobalt durable local record' : 'durable embedded record',
  category: index % 100,
  embedding: embedding(index + 1),
}));

const fuse = (
  textHits: TextSearchHit<StoredHybridDocument>[],
  vectorHits: VectorSearchHit<StoredHybridDocument>[],
  textWeight: number,
  vectorWeight: number,
): HybridSearchHit<StoredHybridDocument>[] => {
  const hits = new Map<string, HybridSearchHit<StoredHybridDocument> & { id: string }>();
  const get = (document: StoredHybridDocument) => {
    const current = hits.get(document._id) ?? { components: {}, document, id: document._id, score: 0 };
    hits.set(document._id, current);
    return current;
  };
  textHits.forEach((source, index) => {
    const hit = get(source.document);
    const contribution = textWeight / (RANK_CONSTANT + index + 1);
    hit.components.text = { contribution, matchedTerms: source.matchedTerms, rank: index + 1, score: source.score };
    hit.score += contribution;
  });
  vectorHits.forEach((source, index) => {
    const hit = get(source.document);
    const contribution = vectorWeight / (RANK_CONSTANT + index + 1);
    hit.components.vector = { contribution, rank: index + 1, score: source.score };
    hit.score += contribution;
  });
  const rank = (hit: HybridSearchHit<StoredHybridDocument>, component: 'text' | 'vector') =>
    hit.components[component]?.rank ?? Number.POSITIVE_INFINITY;
  return [...hits.values()].sort((left, right) => right.score - left.score ||
    Math.min(rank(left, 'text'), rank(left, 'vector')) - Math.min(rank(right, 'text'), rank(right, 'vector')) ||
    rank(left, 'text') - rank(right, 'text') || rank(left, 'vector') - rank(right, 'vector') ||
    left.id.localeCompare(right.id)).slice(0, LIMIT);
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

const measure = async (repetitions: number, operation: () => Promise<void>): Promise<Sample> => {
  global.gc?.();
  const heapBefore = process.memoryUsage().heapUsed;
  const started = performance.now();
  for (let repetition = 0; repetition < repetitions; repetition += 1) await operation();
  const milliseconds = performance.now() - started;
  return { heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore, milliseconds, perOperationMs: milliseconds / repetitions };
};

const openCollection = (adapter: AdapterName, storagePath: string): Promise<ICollection<HybridDocument>> => {
  const database = new Cama({
    path: storagePath,
    persistenceAdapter: adapter === 'fs' ? PersistenceAdapterEnum.FS : PersistenceAdapterEnum.InMemory,
  });
  return database.initCollection<HybridDocument>('hybrid-records', {
    columns: [],
    indexes: ['category'],
    searchIndexes: ['body'],
    vectorIndexes: [{ field: 'embedding', dimensions: DIMENSIONS }],
  });
};

const runIteration = async (adapter: AdapterName, size: number, engine: Engine) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'camadb-hybrid-search-'));
  const collection = await openCollection(adapter, root);
  try {
    const source = documents(size);
    for (let offset = 0; offset < source.length; offset += 10_000) {
      await collection.insertMany(source.slice(offset, offset + 10_000));
    }
    const vector = embedding(18);
    const search = async (category?: number, textWeight = 1, vectorWeight = 1) => {
      const filter = category === undefined ? undefined : { category };
      if (engine === 'native') return collection.searchHybrid({
        candidateLimit: CANDIDATE_LIMIT,
        filter,
        fusion: { strategy: 'rrf', rankConstant: RANK_CONSTANT, textWeight, vectorWeight },
        limit: LIMIT,
        text: { match: 'all', query: 'cobalt harbor' },
        vector: { field: 'embedding', metric: 'cosine', query: vector },
      });
      const textSearch = () => textWeight === 0 ? Promise.resolve([]) : collection.searchText('cobalt harbor', {
        filter, limit: CANDIDATE_LIMIT, match: 'all',
      });
      const vectorSearch = () => vectorWeight === 0 ? Promise.resolve([]) : collection.searchVector('embedding', vector, {
        filter, limit: CANDIDATE_LIMIT, metric: 'cosine',
      });
      const [textHits, vectorHits] = engine === 'concurrent'
        ? await Promise.all([textSearch(), vectorSearch()])
        : [await textSearch(), await vectorSearch()];
      return fuse(textHits, vectorHits, textWeight, vectorWeight);
    };
    const operations: Record<Operation, { repetitions: number; run(): Promise<void> }> = {
      'cold-balanced': { repetitions: 1, async run() { assert.equal((await search()).length, LIMIT); } },
      balanced: { repetitions: 10, async run() { assert.equal((await search()).length, LIMIT); } },
      'metadata-filtered': { repetitions: 10, async run() { assert.equal((await search(17)).length, LIMIT); } },
      'text-weighted': { repetitions: 10, async run() { assert.equal((await search(undefined, 2, 0.5)).length, LIMIT); } },
    };
    const results: Array<{ operation: Operation; repetitions: number; sample: Sample }> = [];
    for (const [operation, workload] of Object.entries(operations)) {
      results.push({ operation: operation as Operation, repetitions: workload.repetitions, sample: await measure(workload.repetitions, workload.run) });
    }
    return results;
  } finally {
    await collection.destroy().catch(() => undefined);
    await fs.rm(root, { recursive: true, force: true });
  }
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const engineIndex = args.indexOf('--engine');
  const engine = (engineIndex === -1 ? 'manual' : args[engineIndex + 1]) as Engine;
  if (!['concurrent', 'manual', 'native'].includes(engine)) {
    throw new Error('--engine must be concurrent, manual, or native');
  }
  if (engineIndex !== -1) args.splice(engineIndex, 2);
  const config = parseConfig(args);
  const samples = new Map<string, { adapter: AdapterName; collectionSize: number; operation: Operation; repetitions: number; values: Sample[] }>();
  for (const adapter of config.adapters) for (const size of config.sizes) {
    for (let iteration = 0; iteration < config.iterations; iteration += 1) {
      for (const result of await runIteration(adapter, size, engine)) {
        const key = `${adapter}/${size}/${result.operation}`;
        const current = samples.get(key) ?? { adapter, collectionSize: size, operation: result.operation, repetitions: result.repetitions, values: [] };
        current.values.push(result.sample);
        samples.set(key, current);
      }
    }
  }
  const report = {
    schemaVersion: 1,
    engine,
    generatedAt: new Date().toISOString(),
    workload: { candidateLimit: CANDIDATE_LIMIT, dimensions: DIMENSIONS, limit: LIMIT, rankConstant: RANK_CONSTANT },
    runtime: { architecture: process.arch, cpu: os.cpus()[0]?.model ?? 'unknown', node: process.version, platform: process.platform, totalMemoryBytes: os.totalmem() },
    config,
    results: [...samples.values()].map(({ values, ...result }) => ({ ...result, samples: values, median: {
      heapDeltaBytes: median(values.map((sample) => sample.heapDeltaBytes)),
      milliseconds: median(values.map((sample) => sample.milliseconds)),
      perOperationMs: median(values.map((sample) => sample.perOperationMs)),
    } })),
  };
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (config.output) {
    const outputPath = path.resolve(process.env.INIT_CWD ?? process.cwd(), config.output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, output);
  } else process.stdout.write(output);
};

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
