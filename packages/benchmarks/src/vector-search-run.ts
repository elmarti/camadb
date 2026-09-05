import { strict as assert } from 'assert';
import { Cama, ICollection, PersistenceAdapterEnum, VectorMetric } from '@camadb/core';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { AdapterName, parseConfig } from './config';
import { scanVectors } from './vector-search-reference';

const DEFAULT_DIMENSIONS = 32;
const DEFAULT_LIMIT = 10;

interface VectorDocument {
  _id: string;
  category: number;
  embedding: number[];
}

type Engine = 'bounded' | 'scan';
type Operation = 'cosine-top-10' | 'dot-top-10' | 'euclidean-top-10' | 'metadata-filtered-cosine';

interface Sample {
  heapDeltaBytes: number;
  milliseconds: number;
  perOperationMs: number;
}

const embedding = (seed: number, dimensions: number): number[] => Array.from({ length: dimensions }, (_, dimension) =>
  Math.sin(seed * 0.017 + dimension * 0.31) + Math.cos(seed * 0.013 - dimension * 0.19),
);

const documents = (count: number, dimensions: number): VectorDocument[] => Array.from({ length: count }, (_, index) => ({
  _id: String(index),
  category: index % 100,
  embedding: embedding(index + 1, dimensions),
}));

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
  return {
    heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
    milliseconds,
    perOperationMs: milliseconds / repetitions,
  };
};

const openCollection = (
  adapter: AdapterName,
  storagePath: string,
  dimensions: number,
): Promise<ICollection<VectorDocument>> => {
  const database = new Cama({
    path: storagePath,
    persistenceAdapter: adapter === 'fs' ? PersistenceAdapterEnum.FS : PersistenceAdapterEnum.InMemory,
  });
  return database.initCollection<VectorDocument>('vector-records', {
    columns: [],
    indexes: ['category'],
    vectorIndexes: [{ field: 'embedding', dimensions }],
  });
};

const runIteration = async (
  adapter: AdapterName,
  size: number,
  engine: Engine,
  dimensions: number,
  limit: number,
) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'camadb-vector-search-'));
  const collection = await openCollection(adapter, root, dimensions);
  try {
    const source = documents(size, dimensions);
    for (let offset = 0; offset < source.length; offset += 10_000) {
      await collection.insertMany(source.slice(offset, offset + 10_000));
    }
    const query = embedding(18, dimensions);
    const search = async (metric: VectorMetric, category?: number) => {
      if (engine === 'bounded') {
        return collection.searchVector('embedding', query, { filter: category === undefined ? undefined : { category }, limit, metric });
      }
      const candidates = (await collection.findMany(category === undefined ? {} : { category })).rows;
      return scanVectors(candidates, 'embedding', query, metric, limit);
    };
    const operations: Record<Operation, { repetitions: number; run(): Promise<void> }> = {
      'cosine-top-10': { repetitions: 10, async run() { assert.equal((await search('cosine')).length, limit); } },
      'dot-top-10': { repetitions: 10, async run() { assert.equal((await search('dot')).length, limit); } },
      'euclidean-top-10': { repetitions: 10, async run() { assert.equal((await search('euclidean')).length, limit); } },
      'metadata-filtered-cosine': { repetitions: 10, async run() { assert.equal((await search('cosine', 17)).length, limit); } },
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
  const takePositiveInteger = (option: string, fallback: number): number => {
    const index = args.indexOf(option);
    if (index === -1) return fallback;
    const parsed = Number(args[index + 1]);
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${option} must be a positive integer`);
    args.splice(index, 2);
    return parsed;
  };
  const dimensions = takePositiveInteger('--dimensions', DEFAULT_DIMENSIONS);
  const limit = takePositiveInteger('--limit', DEFAULT_LIMIT);
  const engineIndex = args.indexOf('--engine');
  const engine = (engineIndex === -1 ? 'scan' : args[engineIndex + 1]) as Engine;
  if (engine !== 'scan' && engine !== 'bounded') throw new Error('--engine must be scan or bounded');
  if (engineIndex !== -1) args.splice(engineIndex, 2);
  const config = parseConfig(args);
  const samples = new Map<string, { adapter: AdapterName; collectionSize: number; operation: Operation; repetitions: number; values: Sample[] }>();
  for (const adapter of config.adapters) for (const size of config.sizes) {
    for (let iteration = 0; iteration < config.iterations; iteration += 1) {
      for (const result of await runIteration(adapter, size, engine, dimensions, limit)) {
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
    workload: { dimensions, limit },
    runtime: { architecture: process.arch, cpu: os.cpus()[0]?.model ?? 'unknown', node: process.version, platform: process.platform, totalMemoryBytes: os.totalmem() },
    config,
    results: [...samples.values()].map(({ values, ...result }) => ({
      ...result,
      samples: values,
      median: {
        heapDeltaBytes: median(values.map((sample) => sample.heapDeltaBytes)),
        milliseconds: median(values.map((sample) => sample.milliseconds)),
        perOperationMs: median(values.map((sample) => sample.perOperationMs)),
      },
    })),
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
