const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const targets = ['chrome-mv3', 'firefox-mv2', 'safari-mv2'];
const errors = [];

for (const target of targets) {
  const output = path.join(root, '.output', target);
  const manifestPath = path.join(output, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    errors.push(`${target}: manifest is missing`);
    continue;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.devtools_page !== 'devtools.html') errors.push(`${target}: DevTools entrypoint is missing`);
  const expectedPermissions = target === 'safari-mv2' ? ['devtools'] : [];
  if (JSON.stringify(manifest.permissions ?? []) !== JSON.stringify(expectedPermissions)) {
    errors.push(`${target}: unexpected permissions requested`);
  }
  if ((manifest.host_permissions ?? []).length > 0) errors.push(`${target}: unexpected host permissions requested`);
  for (const asset of ['devtools.html', 'panel.html', 'camadb-mark.svg']) {
    if (!fs.existsSync(path.join(output, asset))) errors.push(`${target}: ${asset} is missing`);
  }
  if (target === 'firefox-mv2') {
    const disclosure = manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required;
    if (!Array.isArray(disclosure) || disclosure.join(',') !== 'none') {
      errors.push(`${target}: Firefox no-data-collection declaration is missing`);
    }
  } else if (manifest.browser_specific_settings?.gecko) {
    errors.push(`${target}: Firefox-only manifest settings leaked into this build`);
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('Studio builds are permission-minimal and complete for Chromium, Firefox, and Safari.');
