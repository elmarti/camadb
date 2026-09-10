const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const docs = path.resolve(root, process.argv[2] || 'apps/website/out/docs');
const output = path.dirname(docs);
const failures = [];
function check(target, from) {
  const [pathname, fragment] = target.split('#');
  if (/^(?:[a-z]+:|\/\/)/i.test(pathname)) return;
  let file = path.resolve(path.dirname(from), decodeURIComponent(pathname.split('?')[0]));
  if (!pathname) file = from;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) failures.push(`${path.relative(root, from)} → ${target}`);
  else if (fragment && file.endsWith('.html')) {
    const html = fs.readFileSync(file, 'utf8');
    const id = decodeURIComponent(fragment);
    if (!html.includes(`id="${id}"`)) failures.push(`${path.relative(root, from)} → missing #${id} in ${file}`);
  }
}
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith('.html')) {
      for (const match of fs.readFileSync(file, 'utf8').matchAll(/(?:href|src)="([^"]+)"/g)) check(match[1], file);
    }
  }
}
walk(docs);
for (const match of fs
  .readFileSync(path.join(root, 'README.md'), 'utf8')
  .matchAll(/https:\/\/elmarti\.github\.io\/camadb\/(docs\/[^)\s]+)/g)) {
  check(match[1], path.join(output, 'index.html'));
}
if (failures.length) throw new Error(`Broken documentation links:\n${failures.join('\n')}`);
console.log('Generated documentation links, fragments, assets and README destinations are valid.');
