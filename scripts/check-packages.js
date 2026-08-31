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
  if (!manifest.private && !manifest.files) errors.push(`${manifest.name} has no files allow-list`);
  if (!manifest.private && !manifest.publishConfig) errors.push(`${manifest.name} has no publishConfig`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Publishable package manifests are explicit.');
