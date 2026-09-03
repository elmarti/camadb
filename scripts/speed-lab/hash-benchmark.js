const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createHasher, jsHash } = require('./hash');

(async () => {
  const hasher = await createHasher();
  const records = [];
  const iterations = 15;
  for (const size of [100, 1000, 10000, 100000]) {
    const ids = Array.from({ length: size }, (_, i) => String(i));
    const expected = Uint32Array.from(ids, jsHash);
    const info = hasher.pack(ids);
    const methods = {
      'js-strings': () => {
        const result = new Uint32Array(ids.length);
        for (let i = 0; i < ids.length; i++) result[i] = jsHash(ids[i]);
        return result;
      },
      'js-packed-kernel': () => hasher.jsPacked(info),
      'wasm-packed-kernel': () => hasher.packed(info),
      'wasm-end-to-end': () => hasher.endToEnd(ids),
    };
    for (const run of Object.values(methods)) { assert.deepEqual(run(), expected); for (let warm = 0; warm < 20; warm++) run(); }
    const samples = Object.fromEntries(Object.keys(methods).map((key) => [key, []]));
    const repetitions = Math.max(5, Math.ceil(1000000 / size));
    for (let iteration = 0; iteration < iterations; iteration++) {
      const names = Object.keys(methods);
      // Rotate execution order so no implementation always benefits from going first.
      for (let offset = 0; offset < names.length; offset++) {
        const name = names[(offset + iteration) % names.length];
        global.gc?.();
        let checksum = 0;
        const started = performance.now();
        for (let repeat = 0; repeat < repetitions; repeat++) checksum += methods[name]()[repeat % size];
        const milliseconds = (performance.now() - started) / repetitions;
        assert.ok(Number.isFinite(checksum));
        samples[name].push(milliseconds);
      }
    }
    for (const [name, values] of Object.entries(samples)) {
      const sorted = [...values].sort((a, b) => a - b);
      records.push({ size, name, samplesMs: values, medianMs: sorted[7], p95Ms: sorted[14] });
    }
  }
  const report = { kind: 'component benchmark, NOT a database throughput claim', generatedAt: new Date().toISOString(),
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    runtime: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0].model },
    iterations, wasm: { startupMs: hasher.startupMs, binaryBytes: hasher.binaryBytes, startupExcludesWatCompiler: true }, records };
  const output = path.resolve(process.argv[2] ?? 'docs/benchmarks/speed-lab/hash.json');
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(records.map(({ size, name, medianMs }) => ({ size, name, medianMs })));
})().catch((error) => { console.error(error); process.exitCode = 1; });
