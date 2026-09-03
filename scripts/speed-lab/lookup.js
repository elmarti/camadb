// Small JS-only candidate: avoid full filter/set scans for zero/one-ID lookups.
// No storage layout, serialization, write, or broad-query changes.
module.exports = function installLookup() {
  const Adapter = require('../../packages/core/dist/modules/persistence/inmemory/inmemory-persistence').default;
  const original = Adapter.prototype.getRecords;
  Adapter.prototype.getRecords = async function(ids) {
    this.checkDestroyed();
    if (!ids.length) return new Map();
    if (ids.length !== 1) return original.call(this, ids);
    const row = await this.getRecord(ids[0]);
    return row === undefined ? new Map() : new Map([[ids[0], row]]);
  };
};
