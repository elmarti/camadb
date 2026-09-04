const path = require('path');
const assert = require('assert/strict');
const { createHasher, jsHash } = require('./hash');

(async () => {
  const candidate = process.argv.splice(2, 1)[0];
  if (candidate === 'map') {
    require('../../packages/core/dist/modules/persistence/inmemory/inmemory-persistence').default = require('./map-adapter');
  } else if (candidate === 'segment') {
    require('../../packages/core/dist/modules/persistence/fs/fs-persistence').default = require('./segment-adapter');
  } else if (candidate === 'embedded') {
    require('../../packages/core/dist/modules/persistence/fs/fs-persistence').default = require('./embedded-segment-adapter');
  } else if (candidate === 'record-pages') {
    require('../../packages/core/dist/modules/persistence/fs/fs-persistence').default = require('./record-page-adapter').default;
  } else if (candidate === 'lookup') {
    require('./lookup')();
  } else if (candidate === 'wasm') {
    const hasher = await createHasher();
    for (const id of ['', 'a', '123', '日本語', '😀', '\ud800']) assert.equal(hasher.single(id), jsHash(id));
    const adapter = require('../../packages/core/dist/modules/persistence/fs/fs-persistence').default;
    adapter.prototype.shardKey = function(id) { return hasher.single(id).toString(16).padStart(2, '0'); };
  } else if (candidate !== 'baseline') throw new Error('Expected baseline, record-pages, map, segment, embedded, lookup or wasm');
  // Run the SAME committed workload through the public CamaDB API. Only the
  // experimental backend/hash changes, in this disposable child process.
  require(path.resolve(__dirname, '../../packages/benchmarks/dist/run.js'));
})().catch((error) => { console.error(error); process.exitCode = 1; });
