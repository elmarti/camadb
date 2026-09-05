import { strict as assert } from 'assert';
import { Cama, ICollection, PersistenceAdapterEnum } from '@camadb/core';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { AdapterName, parseConfig } from './config';

interface IndexDocument {
  _id: string;
  active: boolean;
  group: number;
  score: number;
  value: string;
}

type Operation =
  | 'cold-equality-count'
  | 'equality-count'
  | 'range-count'
  | 'intersection-count'
  | 'unindexed-miss-count';

interface Sample {
  heapDeltaBytes: number;
  milliseconds: number;
  perOperationMs: number;
}

interface Result {
  adapter: AdapterName;
  collectionSize: number;
  operation: Operation;
  repetitions: number;
  samples: Sample[];
  median: Sample;
}

const INDEXES = ['group', 'score'];

const documents = (count: number): IndexDocument[] =>
  Array.from({ length: count }, (_, index) => ({
    _id: String(index),
    active: index % 2 === 0,
    group: index % 1_000,
    score: index,
    value: `benchmark-row-${index}`,
  }));

const median = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

const medianSample = (samples: Sample[]): Sample => ({
  heapDeltaBytes: median(samples.map((sample) => sample.heapDeltaBytes)),
  milliseconds: median(samples.map((sample) => sample.milliseconds)),
  perOperationMs: median(samples.map((sample) => sample.perOperationMs)),
});

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

const createCollection = async (
  adapter: AdapterName,
  storagePath: string,
  collectionName: string,
): Promise<ICollection<IndexDocument>> => {
  const database = new Cama({
    path: storagePath,
    persistenceAdapter: adapter === 'fs' ? PersistenceAdapterEnum.FS : PersistenceAdapterEnum.InMemory,
  });
  return database.initCollection<IndexDocument>(collectionName, { columns: [], indexes: INDEXES });
};

const runIteration = async (
  adapter: AdapterName,
  size: number,
  iteration: number,
): Promise<Record<Operation, { repetitions: number; sample: Sample }>> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'camadb-index-benchmark-'));
  const collection = await createCollection(adapter, root, `records-${iteration}`);
  const targetGroup = Math.min(500, size - 1);
  const rangeStart = Math.floor(size / 2);
  const rangeEnd = Math.min(size, rangeStart + 100);
  const expectedGroupCount = size <= targetGroup ? 0 : Math.floor((size - 1 - targetGroup) / 1_000) + 1;
  const expectedIntersectionCount =
    Array.from({ length: Math.max(0, rangeEnd - rangeStart) }, (_, offset) => rangeStart + offset).filter(
      (score) => score % 1_000 === targetGroup,
    ).length;

  try {
    const rows = documents(size);
    for (let offset = 0; offset < rows.length; offset += 10_000) {
    await collection.insertMany(rows.slice(offset, offset + 10_000));
    }
    const operations: Record<Operation, { repetitions: number; run(): Promise<void> }> = {
      'cold-equality-count': {
        repetitions: 1,
        async run() {
          assert.equal(await collection.count({ group: targetGroup }), expectedGroupCount);
        },
      },
      'equality-count': {
        repetitions: 20,
        async run() {
          assert.equal(await collection.count({ group: targetGroup }), expectedGroupCount);
        },
      },
      'range-count': {
        repetitions: 20,
        async run() {
          assert.equal(await collection.count({ score: { $gte: rangeStart, $lt: rangeEnd } }), rangeEnd - rangeStart);
        },
      },
      'intersection-count': {
        repetitions: 20,
        async run() {
          assert.equal(
            await collection.count({ group: targetGroup, score: { $gte: rangeStart, $lt: rangeEnd } }),
            expectedIntersectionCount,
          );
        },
      },
      'unindexed-miss-count': {
        repetitions: 5,
        async run() {
          assert.equal(await collection.count({ value: 'not-present' }), 0);
        },
      },
    };
    const result = {} as Record<Operation, { repetitions: number; sample: Sample }>;
    for (const [name, operation] of Object.entries(operations) as Array<
      [Operation, { repetitions: number; run(): Promise<void> }]
    >) {
      result[name] = { repetitions: operation.repetitions, sample: await measure(operation.repetitions, operation.run) };
    }
    return result;
  } finally {
    await collection.destroy().catch(() => undefined);
    await fs.rm(root, { force: true, recursive: true });
  }
};

const main = async (): Promise<void> => {
  const config = parseConfig(process.argv.slice(2));
  const results: Result[] = [];
  for (const adapter of config.adapters) {
    for (const size of config.sizes) {
      const samples = new Map<Operation, { repetitions: number; values: Sample[] }>();
      for (let iteration = 0; iteration < config.iterations; iteration += 1) {
        const iterationResults = await runIteration(adapter, size, iteration);
        for (const [operation, result] of Object.entries(iterationResults) as Array<
          [Operation, { repetitions: number; sample: Sample }]
        >) {
          const previous = samples.get(operation) ?? { repetitions: result.repetitions, values: [] };
          previous.values.push(result.sample);
          samples.set(operation, previous);
        }
      }
      for (const [operation, result] of samples) {
        results.push({
          adapter,
          collectionSize: size,
          operation,
          repetitions: result.repetitions,
          samples: result.values,
          median: medianSample(result.values),
        });
      }
    }
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runtime: {
      architecture: process.arch,
      cpu: os.cpus()[0]?.model ?? 'unknown',
      node: process.version,
      platform: process.platform,
      totalMemoryBytes: os.totalmem(),
    },
    indexes: INDEXES,
    config,
    results,
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
