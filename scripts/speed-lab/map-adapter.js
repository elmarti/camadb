// Experimental, intentionally not wired into the production factory.
// JSON-like documents with unique string identities only. No snapshot guarantee.
class MapAdapter {
  constructor() { this.rows = new Map(); this.generation = 0; this.destroyed = false; }
  check() { if (this.destroyed) throw new Error('Collection has been destroyed'); }
  async cacheRevision() { this.check(); return String(this.generation); }
  async getData() { this.check(); return Array.from(this.rows.values()); }
  async getRecord(id) { this.check(); return this.rows.get(id); }
  async getRecords(ids) {
    this.check();
    const result = new Map();
    for (const id of ids) if (this.rows.has(id)) result.set(id, this.rows.get(id));
    return result;
  }
  async *iterateRecords() { this.check(); yield* this.rows.values(); }
  async insert(rows) {
    this.check();
    const seen = new Set();
    for (const row of rows) {
      if (typeof row._id !== 'string' || seen.has(row._id) || this.rows.has(row._id)) throw new Error('Invalid or duplicate identity');
      seen.add(row._id);
    }
    for (const row of rows) this.rows.set(row._id, row);
    this.generation++;
  }
  async update(rows) {
    this.check();
    const next = new Map();
    for (const row of rows) {
      if (typeof row._id !== 'string' || next.has(row._id)) throw new Error('Invalid or duplicate identity');
      next.set(row._id, row);
    }
    this.rows = next; this.generation++;
  }
  async mutateRecords({ puts = [], deletes = [] }) {
    this.check();
    if (Math.max(puts.length, deletes.length) > 10000) throw new Error('Mutation exceeds record budget');
    for (const row of puts) if (typeof row._id !== 'string') throw new Error('Invalid identity');
    for (const id of deletes) this.rows.delete(id);
    for (const row of puts) this.rows.set(row._id, row);
    this.generation++;
  }
  async compact() { this.check(); }
  async storageStats() {
    this.check();
    const bytes = Buffer.byteLength(JSON.stringify(Array.from(this.rows.values())));
    return { generation: this.generation, liveBytes: bytes, totalBytes: bytes, reclaimableBytes: 0, tombstones: 0 };
  }
  async destroy() { this.rows.clear(); this.destroyed = true; }
}
module.exports = MapAdapter;
