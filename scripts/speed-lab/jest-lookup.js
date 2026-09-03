// Exercise the exact experimental fast path against the existing TS test suite.
const compiled = require('../../packages/core/dist/modules/persistence/inmemory/inmemory-persistence');
const previous = compiled.default;
try {
  compiled.default = require('../../packages/core/src/modules/persistence/inmemory/inmemory-persistence').default;
  require('./lookup')();
} finally {
  compiled.default = previous;
}
