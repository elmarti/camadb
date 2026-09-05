import { strict as assert } from 'assert';
import { Cama, ICollection, PersistenceAdapterEnum } from '@camadb/core';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { AdapterName, parseConfig } from './config';
import { scanText } from './text-search-reference';

interface SearchDocument {
  _id: string;
  body: string;
  category: number;
  title: string;
}

type Operation = 'cold-selective' | 'selective' | 'common' | 'metadata-filtered';

interface Sample {
  heapDeltaBytes: number;
  milliseconds: number;
  perOperationMs: number;
}

const documents = (count: number): SearchDocument[] =>
  Array.from({ length: count }, (_, index) => {
    const selective = index % 1_000 === 17;
    const related = index % 100 === 17;
    return {
      _id: String(index),
      body: selective
        ? 'cobalt harbor harbor durable local records'
        : related
          ? 'cobalt durable local records'
          : 'durable local records for embedded applications',
      category: index % 100,
      title: selective ? `Harbor report ${index}` : `Record report ${index}`,
    };
  });

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

const collection = async (adapter: AdapterName, storagePath: string): Promise<ICollection<SearchDocument>> => {
  const database = new Cama({
    path: storagePath,
    persistenceAdapter: adapter === 'fs' ? PersistenceAdapterEnum.FS : PersistenceAdapterEnum.InMemory,
  });
  return database.initCollection<SearchDocument>('search-records', { columns: [], indexes: ['category'] });
};

const runIteration = async (adapter: AdapterName, size: number) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'camadb-text-search-'));
  const records = await collection(adapter, root);
  try {
    const source = documents(size);
    for (let offset = 0; offset < source.length; offset += 10_000) {
      await records.insertMany(source.slice(offset, offset + 10_000));
    }
    const expectedSelective = source.filter((row) => row._id !== '' && Number(row._id) % 1_000 === 17).length;
    const search = async (query: string, filter?: { category: number }, match: 'all' | 'any' = 'any') => {
      const candidates = (await records.findMany(filter ?? {})).rows;
      return scanText(candidates, query, ['title', 'body'], match);
    };
    const operations: Record<Operation, { repetitions: number; run(): Promise<void> }> = {
      'cold-selective': { repetitions: 1, async run() {
        assert.equal((await search('cobalt harbor', undefined, 'all')).length, expectedSelective);
      } },
      selective: { repetitions: 10, async run() {
        assert.equal((await search('cobalt harbor', undefined, 'all')).length, expectedSelective);
      } },
      common: { repetitions: 5, async run() { assert.equal((await search('durable')).length, size); } },
      'metadata-filtered': { repetitions: 10, async run() {
        assert.equal((await search('cobalt harbor', { category: 17 }, 'all')).length, expectedSelective);
      } },
    };
    const results: Array<{ operation: Operation; repetitions: number; sample: Sample }> = [];
    for (const [operation, workload] of Object.entries(operations)) {
      results.push({
        operation: operation as Operation,
        repetitions: workload.repetitions,
        sample: await measure(workload.repetitions, workload.run),
      });
    }
    return results;
  } finally {
    await records.destroy().catch(() => undefined);
    await fs.rm(root, { force: true, recursive: true });
  }
};

const main = async (): Promise<void> => {
  const config = parseConfig(process.argv.slice(2));
  const samples = new Map<string, { adapter: AdapterName; collectionSize: number; operation: Operation; repetitions: number; values: Sample[] }>();
  for (const adapter of config.adapters) {
    for (const size of config.sizes) {
      for (let iteration = 0; iteration < config.iterations; iteration += 1) {
        for (const result of await runIteration(adapter, size)) {
          const key = `${adapter}/${size}/${result.operation}`;
          const current = samples.get(key) ?? { adapter, collectionSize: size, operation: result.operation, repetitions: result.repetitions, values: [] };
          current.values.push(result.sample);
          samples.set(key, current);
        }
      }
    }
  }
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
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
