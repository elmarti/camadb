import { IPersistenceAdapter } from '../../../interfaces/persistence-adapter.interface';
import { assertMutationBound } from '../record-pages';

export default class InmemoryPersistence implements IPersistenceAdapter {
  private dbName? = '';
  private destroyed = false;
  private collectionName = '';
  private cache: any = [];

  async destroy(): Promise<void> {
    this.cache = null;
    this.destroyed = true;
  }
  async update(updated: any): Promise<void> {
    this.checkDestroyed();
    this.cache = updated;
  }
  async getData(): Promise<any> {
    this.checkDestroyed();
    return this.cache;
  }
  async insert(rows: Array<any>): Promise<any> {
    this.checkDestroyed();
    const data = await this.getData();
    data.push(...rows);
    this.cache = data;
  }

  async getRecord(id: string): Promise<any | undefined> {
    this.checkDestroyed();
    return this.cache.find((row: { _id?: string }) => row._id === id);
  }

  async getRecords(ids: string[]): Promise<Map<string, any>> {
    const wanted = new Set(ids);
    return new Map(
      this.cache.filter((row: { _id?: string }) => wanted.has(row._id ?? '')).map((row: any) => [row._id, row]),
    );
  }

  async *iterateRecords(): AsyncIterable<any> {
    for (const row of await this.getData()) yield row;
  }

  async mutateRecords(mutation: { deletes?: string[]; puts?: any[] }): Promise<void> {
    this.checkDestroyed();
    assertMutationBound(Math.max(mutation.deletes?.length ?? 0, mutation.puts?.length ?? 0));
    const deleted = new Set(mutation.deletes ?? []);
    const replacements = new Map((mutation.puts ?? []).map((row) => [row._id, row]));
    this.cache = this.cache
      .filter((row: { _id?: string }) => !deleted.has(row._id ?? ''))
      .map((row: { _id?: string }) => replacements.get(row._id) ?? row);
    for (const row of replacements.values()) {
      if (!this.cache.some((current: { _id?: string }) => current._id === row._id)) this.cache.push(row);
    }
  }

  private checkDestroyed() {
    if (this.destroyed) {
      throw new Error('Collection has been destroyed. Call Cama.initCollection to recreate');
    }
  }
}
