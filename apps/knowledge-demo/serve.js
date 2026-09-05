const fs = require('fs');
const http = require('http');
const path = require('path');

const port = Number(process.env.PORT || 4173);
const root = path.join(__dirname, 'dist');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

http
  .createServer((request, response) => {
    const requested = request.url === '/' ? '/index.html' : request.url.split('?')[0];
    const file = path.resolve(root, `.${requested}`);
    if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file)) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.setHeader('Content-Type', contentTypes[path.extname(file)] || 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(file).pipe(response);
  })
  .listen(port, '127.0.0.1', () => {
    console.log(`Knowledge demo: http://127.0.0.1:${port}`);
  });
