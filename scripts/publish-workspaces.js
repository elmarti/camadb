const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.resolve(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');
const order = ['core', 'memory', 'camadb'];

for (const directory of order) {
  const cwd = path.join(root, 'packages', directory);
  const manifest = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  const args = dryRun
    ? ['pack', '--dry-run']
    : ['publish', '--access', manifest.publishConfig.access];
  const result = spawnSync('npm', args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, npm_config_cache: path.join(os.tmpdir(), 'camadb-npm-cache') },
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
