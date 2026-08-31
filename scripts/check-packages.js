const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const errors = [];
for (const directory of fs.readdirSync(path.join(root, 'packages'))) {
  const packageDirectory = path.join(root, 'packages', directory);
  const manifestPath = path.join(packageDirectory, 'package.json');
  if (!fs.existsSync(manifestPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.private && !manifest.exports) errors.push(`${manifest.name} has no explicit exports`);
  const rootExport = manifest.exports && manifest.exports['.'];
  if (!manifest.private && (!rootExport || !rootExport.types || !rootExport.import || !rootExport.require)) {
    errors.push(`${manifest.name} must export types, import, and require entry points`);
  }
  if (!manifest.private && !manifest.files) errors.push(`${manifest.name} has no files allow-list`);
  if (!manifest.private && !manifest.publishConfig) errors.push(`${manifest.name} has no publishConfig`);
  if (!manifest.private && manifest.engines?.node !== '>=22') {
    errors.push(`${manifest.name} must declare the supported Node.js range`);
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Publishable package manifests are explicit.');
