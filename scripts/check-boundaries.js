const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packageRoot = path.join(root, 'packages');
const errors = [];

for (const directory of fs.readdirSync(packageRoot)) {
  const current = path.join(packageRoot, directory);
  const manifestPath = path.join(current, 'package.json');
  if (!fs.existsSync(manifestPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const declared = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies };
  const source = path.join(current, 'src');
  if (!fs.existsSync(source)) continue;

  const visit = (location) => {
    for (const entry of fs.readdirSync(location, { withFileTypes: true })) {
      const file = path.join(location, entry.name);
      if (entry.isDirectory()) visit(file);
      if (!entry.isFile() || !/\.[cm]?[jt]s$/.test(entry.name)) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(/(?:from\s+|require\()['"]([^'"]+)/g)) {
        const specifier = match[1];
        if (specifier.includes('/src/') || specifier.includes('/dist/')) {
          errors.push(`${path.relative(root, file)} imports package internals: ${specifier}`);
        }
        const workspaceName = specifier.startsWith('@camadb/') ? specifier.split('/').slice(0, 2).join('/') : specifier;
        if ((workspaceName === 'camadb' || workspaceName.startsWith('@camadb/')) && workspaceName !== manifest.name && !declared[workspaceName]) {
          errors.push(`${path.relative(root, file)} uses undeclared workspace dependency: ${workspaceName}`);
        }
      }
    }
  };
  visit(source);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Workspace dependency boundaries are valid.');
