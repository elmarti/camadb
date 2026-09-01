import { Cama, ICollection, PersistenceAdapterEnum } from '@camadb/core';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { AdapterName, parseConfig } from './config';

interface BenchmarkDocument {
  _id: string;
  group: number;
  value: string;
}

interface Sample {
  collectionBytes: number | null;
  heapDeltaBytes: number;
  milliseconds: number;
}

interface Result {
  adapter: AdapterName;
  collectionSize: number;
  operation: 'bulk-insert' | 'point-read' | 'point-update' | 'point-delete';
  samples: Sample[];
  median: Sample;
}

const collectionConfig = { columns: [], indexes: [] };

const createDocuments = (count: number): BenchmarkDocument[] =>
  Array.from({ length: count }, (_, index) => ({
    _id: String(index),
    group: index % 10,
    value: `benchmark-row-${index}`,
  }));

const median = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const medianSample = (samples: Sample[]): Sample => ({
  collectionBytes:
    samples[0].collectionBytes === null ? null : median(samples.map((sample) => sample.collectionBytes as number)),
  heapDeltaBytes: median(samples.map((sample) => sample.heapDeltaBytes)),
  milliseconds: median(samples.map((sample) => sample.milliseconds)),
});

const directoryBytes = async (directory: string): Promise<number> => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const sizes = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? directoryBytes(entryPath) : (await fs.stat(entryPath)).size;
    }),
  );
  return sizes.reduce((total, size) => total + size, 0);
};

const measure = async (operation: () => Promise<void>, storagePath?: string): Promise<Sample> => {
  global.gc?.();
  const heapBefore = process.memoryUsage().heapUsed;
  const started = performance.now();
  await operation();
  const milliseconds = performance.now() - started;
  const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;
  const collectionBytes = storagePath ? await directoryBytes(storagePath) : null;
  return { collectionBytes, heapDeltaBytes, milliseconds };
};

const initCollection = async (
  adapter: AdapterName,
  storagePath: string,
  collectionName: string,
): Promise<ICollection<BenchmarkDocument>> => {
  const database = new Cama({
    path: storagePath,
    persistenceAdapter: adapter === 'fs' ? PersistenceAdapterEnum.FS : PersistenceAdapterEnum.InMemory,
  });
  return database.initCollection<BenchmarkDocument>(collectionName, collectionConfig);
};

const seed = async (
  adapter: AdapterName,
  storagePath: string,
  collectionName: string,
  documents: BenchmarkDocument[],
): Promise<ICollection<BenchmarkDocument>> => {
  const collection = await initCollection(adapter, storagePath, collectionName);
  await collection.insertMany(documents);
  return collection;
};

const runIteration = async (
  adapter: AdapterName,
  size: number,
  iteration: number,
): Promise<Record<Result['operation'], Sample>> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'camadb-benchmark-'));
  const documents = createDocuments(size);
  const collectionPath = (name: string): string | undefined => (adapter === 'fs' ? path.join(root, name) : undefined);
  const names = {
    insert: `insert-${iteration}`,
    read: `read-${iteration}`,
    update: `update-${iteration}`,
    delete: `delete-${iteration}`,
  };

  try {
    const insertCollection = await initCollection(adapter, root, names.insert);
    const insert = await measure(async () => {
      await insertCollection.insertMany(documents);
    }, collectionPath(names.insert));

    const readCollection = await seed(adapter, root, names.read, documents);
    const read = await measure(async () => {
      await readCollection.findMany({ _id: String(Math.floor(size / 2)) });
    }, collectionPath(names.read));

    const updateCollection = await seed(adapter, root, names.update, documents);
    const update = await measure(async () => {
      await updateCollection.updateMany({ _id: String(Math.floor(size / 2)) }, { $set: { value: 'updated' } });
    }, collectionPath(names.update));

    const deleteCollection = await seed(adapter, root, names.delete, documents);
    const deletion = await measure(async () => {
      await deleteCollection.deleteOne({ _id: String(Math.floor(size / 2)) });
    }, collectionPath(names.delete));

    return {
      'bulk-insert': insert,
      'point-read': read,
      'point-update': update,
      'point-delete': deletion,
    };
  } finally {
    await fs.rm(root, { force: true, recursive: true });
  }
};

const main = async (): Promise<void> => {
  const config = parseConfig(process.argv.slice(2));
  const results: Result[] = [];

  for (const adapter of config.adapters) {
    for (const size of config.sizes) {
      const byOperation = new Map<Result['operation'], Sample[]>();
      for (let iteration = 0; iteration < config.iterations; iteration += 1) {
        const iterationResults = await runIteration(adapter, size, iteration);
        for (const [operation, sample] of Object.entries(iterationResults) as Array<[Result['operation'], Sample]>) {
          byOperation.set(operation, [...(byOperation.get(operation) ?? []), sample]);
        }
      }
      for (const [operation, samples] of byOperation) {
        results.push({ adapter, collectionSize: size, operation, samples, median: medianSample(samples) });
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
