const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../docs/benchmarks/speed-lab');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name + '.json'), 'utf8'));
const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
const rows = [];
for (const [candidate, baseline, target] of [['map', 'memory-baseline', 'memory-map'], ['lookup', 'lookup-baseline', 'memory-lookup'], ['wasm', 'fs-baseline', 'fs-wasm']]) {
  for (const suffix of ['', '-repeat']) {
    const before = read(baseline + suffix);
    const after = read(target + suffix);
    for (const result of before.results) {
      const match = after.results.find(row => row.collectionSize === result.collectionSize && row.operation === result.operation);
      const base = result.median.milliseconds;
      const next = match.median.milliseconds;
      rows.push({ candidate, workload: 'original', repeat: !!suffix, size: result.collectionSize, operation: result.operation,
        baselineMs: base, candidateMs: next, ratio: next / base, regression: next - base > Math.max(base * 0.10, 0.05) });
    }
  }
}
for (const candidate of ['map', 'lookup']) for (const suffix of ['', '-repeat']) {
  const before = read('mixed-baseline' + suffix).samples;
  const after = read('mixed-' + candidate + suffix).samples;
  for (const size of [100, 1000, 10000, 100000]) for (const operation of [...new Set(before.map(row => row.operation))]) {
    const samples = list => list.filter(row => row.size === size && row.operation === operation).map(row => row.perOperationMs);
    const base = median(samples(before));
    const next = median(samples(after));
    rows.push({ candidate, workload: 'mixed', repeat: !!suffix, size, operation, baselineMs: base, candidateMs: next,
      ratio: next / base, regression: next - base > Math.max(base * 0.10, 0.05) });
  }
}
const decisions = Object.fromEntries(['map', 'lookup', 'wasm'].map(candidate => {
  const selected = rows.filter(row => row.candidate === candidate);
  return [candidate, { flaggedRegressions: selected.filter(row => row.regression).length,
    repeatedWins: selected.filter(row => !row.repeat && row.ratio < 0.8 && row.baselineMs - row.candidateMs > 0.01 &&
      selected.some(other => other.repeat && other.workload === row.workload && other.size === row.size && other.operation === row.operation && other.ratio < 0.8 && other.baselineMs - other.candidateMs > 0.01)).length }];
}));
fs.writeFileSync(path.join(root, 'comparison.json'), JSON.stringify({
  note: 'Provisional regression screen: >10% AND >0.05 ms slower per operation. This is not statistical proof, a CI timing threshold, or production approval. Inspect raw samples, both run orders, memory and correctness.',
  decisions, rows,
}, null, 2) + '\n');
console.log(decisions);
console.table(rows.filter(row => row.size === 10000 && !row.repeat));
