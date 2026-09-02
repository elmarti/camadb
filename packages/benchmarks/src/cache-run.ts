import { Cama, CacheMode, Collection, PersistenceAdapterEnum } from '@camadb/core';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { AdapterName, parseConfig } from './config';
import { cacheWorkload } from './cache-workload';

const modes: CacheMode[] = ['disabled', 'eager', 'lazy', 'lru'];
const budget = { maxBytes: 64 * 1024, maxRecords: 64 };
type Row = { _id: string; group: number; value: string };

async function sample(adapter: AdapterName, size: number, mode: CacheMode, workload: 'hot' | 'scan') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'camadb-cache-benchmark-'));
  let collection: Collection<Row> | undefined;
  try {
    const db = new Cama({
      path: root,
      persistenceAdapter: adapter === 'fs' ? PersistenceAdapterEnum.FS : PersistenceAdapterEnum.InMemory,
      cache: { mode, ...budget },
    });
    collection = (await db.initCollection<Row>('records', { columns: [], indexes: [] })) as Collection<Row>;
    for (let start = 0; start < size; start += 10_000) {
      await collection.insertMany(
        Array.from({ length: Math.min(10_000, size - start) }, (_, offset) => {
          const index = start + offset;
          return { _id: String(index), group: index % 10, value: `benchmark-row-${index}` };
        }),
      );
    }
    collection.clearCache();
    global.gc?.();
    const warmHeapBefore = process.memoryUsage().heapUsed;
    const warmStarted = performance.now();
    await collection.initializeCache();
    const warmMilliseconds = performance.now() - warmStarted;
    const warmHeapDeltaBytes = process.memoryUsage().heapUsed - warmHeapBefore;
    const before = collection.cacheStats();
    const ids = cacheWorkload(size, workload);
    global.gc?.();
    const heapBefore = process.memoryUsage().heapUsed;
    const started = performance.now();
    for (const id of ids) {
      const result = await collection.findMany({ _id: id });
      if (result.rows.length !== 1 || result.rows[0]._id !== id || result.rows[0].value !== `benchmark-row-${id}`) {
        throw new Error(`Incorrect result for ${adapter}/${mode}/${id}`);
      }
    }
    const milliseconds = performance.now() - started;
    const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;
    const after = collection.cacheStats();
    if (after.records > budget.maxRecords || after.bytes > budget.maxBytes) throw new Error('Cache exceeded budget');
    const counters = ['hits', 'misses', 'evictions', 'skipped', 'invalidations'] as const;
    const delta = Object.fromEntries(counters.map((key) => [key, after[key] - before[key]]));
    return {
      warmMilliseconds,
      warmHeapDeltaBytes,
      milliseconds,
      perReadMilliseconds: milliseconds / ids.length,
      heapDeltaBytes,
      cache: after,
      readCounters: delta,
    };
  } finally {
    try {
      await collection?.destroy();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
}

async function main() {
  const config = parseConfig(process.argv.slice(2));
  const results = [];
  for (const adapter of config.adapters) {
    for (const size of config.sizes) {
      for (const workload of ['hot', 'scan'] as const) {
        // Rotate mode order by repetition to reduce a fixed ordering bias.
        const samples = new Map<CacheMode, Awaited<ReturnType<typeof sample>>[]>();
        for (let iteration = 0; iteration < config.iterations; iteration++) {
          for (let offset = 0; offset < modes.length; offset++) {
            const mode = modes[(iteration + offset) % modes.length];
            const value = await sample(adapter, size, mode, workload);
            samples.set(mode, [...(samples.get(mode) ?? []), value]);
          }
        }
        for (const mode of modes)
          results.push({ adapter, collectionSize: size, workload, mode, samples: samples.get(mode) });
        process.stderr.write(`Completed cache workload ${adapter}/${size}/${workload}\n`);
      }
    }
  }
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runtime: {
      architecture: process.arch,
      cpu: os.cpus()[0]?.model,
      node: process.version,
      platform: process.platform,
      totalMemoryBytes: os.totalmem(),
    },
    config,
    budget,
    readsPerSample: 256,
    results,
  };
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (config.output) {
    const outputPath = path.resolve(process.env.INIT_CWD ?? process.cwd(), config.output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, output);
  } else process.stdout.write(output);
}

void main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
