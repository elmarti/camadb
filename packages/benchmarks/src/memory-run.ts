import { strict as assert } from 'assert';
import { Cama, PersistenceAdapterEnum } from '@camadb/core';
import { CamaMemory, EmbeddingProfile, RememberInput } from '@camadb/memory';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { AdapterName, parseConfig } from './config';

const DIMENSIONS = 32;
const LIMIT = 10;
const BATCH_SIZE = 10_000;

type Operation = 'batch-remember' | 'hybrid-recall' | 'inspect' | 'text-recall' | 'vector-recall';

interface Sample {
  heapDeltaBytes: number;
  milliseconds: number;
  perOperationMs: number;
}

const profile: EmbeddingProfile = {
  dimensions: DIMENSIONS,
  model: 'deterministic-benchmark-v1',
  provider: 'benchmark-local',
  schemaVersion: 'memory-benchmark-v1',
};

const embedding = (seed: number): number[] => Array.from({ length: DIMENSIONS }, (_, dimension) =>
  Math.sin(seed * 0.017 + dimension * 0.31) + Math.cos(seed * 0.013 - dimension * 0.19),
);

const memories = (count: number): RememberInput[] => Array.from({ length: count }, (_, index) => ({
  category: index % 5 === 0 ? 'fact' : 'observation',
  content: index % 10 === 7 ? 'cobalt harbor durable local memory' : `durable embedded memory ${index}`,
  embedding: { embedding: embedding(index + 1), provenance: profile },
  id: String(index),
  metadata: { sequence: index },
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

const runIteration = async (adapter: AdapterName, size: number, iteration: number) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'camadb-memory-benchmark-'));
  const database = new Cama({
    path: root,
    persistenceAdapter: adapter === 'fs' ? PersistenceAdapterEnum.FS : PersistenceAdapterEnum.InMemory,
  });
  const memory = await CamaMemory.create(database, {
    collectionName: `memories-${iteration}`,
    embeddingProfile: profile,
    now: () => new Date('2026-09-05T00:00:00.000Z'),
  });
  const source = memories(size);
  try {
    const remember = await measure(1, async () => {
      for (let offset = 0; offset < source.length; offset += BATCH_SIZE) {
        await memory.rememberMany(source.slice(offset, offset + BATCH_SIZE));
      }
    });
    const queryEmbedding = { embedding: embedding(18), provenance: profile };
    const operations: Record<Exclude<Operation, 'batch-remember'>, { repetitions: number; run(): Promise<void> }> = {
      'hybrid-recall': {
        repetitions: 10,
        async run() {
          assert.ok((await memory.recall('cobalt harbor', { embedding: queryEmbedding, limit: LIMIT })).length > 0);
        },
      },
      inspect: {
        repetitions: 100,
        async run() {
          assert.equal((await memory.inspect(String(Math.floor(size / 2))))?.id, String(Math.floor(size / 2)));
        },
      },
      'text-recall': {
        repetitions: 10,
        async run() {
          assert.ok((await memory.recall('cobalt harbor', { limit: LIMIT, strategy: 'text' })).length > 0);
        },
      },
      'vector-recall': {
        repetitions: 10,
        async run() {
          assert.equal((await memory.recall('', {
            embedding: queryEmbedding,
            limit: LIMIT,
            strategy: 'vector',
          })).length, Math.min(LIMIT, size));
        },
      },
    };
    const results: Array<{ operation: Operation; repetitions: number; sample: Sample }> = [
      { operation: 'batch-remember', repetitions: 1, sample: remember },
    ];
    for (const [operation, workload] of Object.entries(operations)) {
      results.push({
        operation: operation as Operation,
        repetitions: workload.repetitions,
        sample: await measure(workload.repetitions, workload.run),
      });
    }
    return results;
  } finally {
    await fs.rm(root, { force: true, recursive: true });
  }
};

const main = async (): Promise<void> => {
  const config = parseConfig(process.argv.slice(2));
  const samples = new Map<string, {
    adapter: AdapterName;
    collectionSize: number;
    operation: Operation;
    repetitions: number;
    values: Sample[];
  }>();
  for (const adapter of config.adapters) for (const size of config.sizes) {
    for (let iteration = 0; iteration < config.iterations; iteration += 1) {
      for (const result of await runIteration(adapter, size, iteration)) {
        const key = `${adapter}/${size}/${result.operation}`;
        const current = samples.get(key) ?? {
          adapter,
          collectionSize: size,
          operation: result.operation,
          repetitions: result.repetitions,
          values: [],
        };
        current.values.push(result.sample);
        samples.set(key, current);
      }
    }
  }
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    workload: { batchSize: BATCH_SIZE, dimensions: DIMENSIONS, limit: LIMIT },
    runtime: {
      architecture: process.arch,
      cpu: os.cpus()[0]?.model ?? 'unknown',
      node: process.version,
      platform: process.platform,
      totalMemoryBytes: os.totalmem(),
    },
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
