const fs = require('fs');
const path = require('path');

const websiteRoot = path.resolve(__dirname, '..');
const demoOutput = path.resolve(websiteRoot, '../knowledge-demo/dist');
const destinationRoot = process.argv.includes('--public') ? 'public' : 'out';
const destination = path.join(websiteRoot, destinationRoot, 'demo');

if (!fs.existsSync(demoOutput)) {
  throw new Error('Build @camadb/knowledge-demo before building the website.');
}

fs.rmSync(destination, { force: true, recursive: true });
fs.cpSync(demoOutput, destination, { recursive: true });
console.log(`Included the local knowledge demo at apps/website/${destinationRoot}/demo.`);
