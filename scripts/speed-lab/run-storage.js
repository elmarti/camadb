const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'docs/benchmarks/speed-lab');
fs.mkdirSync(output, { recursive: true });
const jobs = [
  ['baseline', 'fs', 'fs-baseline'], ['wasm', 'fs', 'fs-wasm'],
  ['baseline', 'inmemory', 'memory-baseline'], ['map', 'inmemory', 'memory-map'],
  ['map', 'inmemory', 'memory-map-repeat'], ['baseline', 'inmemory', 'memory-baseline-repeat'],
  ['wasm', 'fs', 'fs-wasm-repeat'], ['baseline', 'fs', 'fs-baseline-repeat'],
  ['baseline', 'inmemory', 'lookup-baseline'], ['lookup', 'inmemory', 'memory-lookup'],
  ['lookup', 'inmemory', 'memory-lookup-repeat'], ['baseline', 'inmemory', 'lookup-baseline-repeat'],
];
for (const [candidate, adapter, name] of jobs) {
  console.log(`Running ${name}`);
  execFileSync(process.execPath, ['--expose-gc', path.join(__dirname, 'storage.js'), candidate,
    '--adapter', adapter, '--sizes', '100,1000,10000', '--iterations', '5', '--output', path.join(output, name + '.json')],
  { cwd: root, stdio: 'inherit' });
}
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const sources = ['packages/benchmarks/src/run.ts', 'packages/benchmarks/src/config.ts', 'scripts/speed-lab/map-adapter.js', 'scripts/speed-lab/hash.wat', 'scripts/speed-lab/hash.js', 'scripts/speed-lab/lookup.js'];
const sourceHashes = Object.fromEntries(sources.map((name) => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex')]));
fs.writeFileSync(path.join(output, 'environment.json'), JSON.stringify({ revision, sourceHashes, generatedAt: new Date().toISOString(),
  cpu: os.cpus()[0].model, node: process.version, platform: process.platform, arch: process.arch, jobs,
  note: 'Sequential fresh child processes; repeat reverses candidate order. No filesystem durability changes. Hash compilation/startup outside operation timing.' }, null, 2) + '\n');
