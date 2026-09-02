import { chunkRecords, MAX_MUTATION_RECORDS, MAX_PAGE_BYTES, MAX_PAGE_RECORDS } from '../record-pages';

describe('record page bounds', () => {
  it('bounds pages by record count', () => {
    const pages = chunkRecords(Array.from({ length: MAX_PAGE_RECORDS + 1 }, (_, id) => ({ id })));
    expect(pages.map((page) => page.length)).toEqual([MAX_PAGE_RECORDS, 1]);
  });

  it('bounds pages by serialized bytes', () => {
    const pages = chunkRecords([{ value: 'a'.repeat(600_000) }, { value: 'b'.repeat(600_000) }]);
    expect(pages).toHaveLength(2);
  });

  it('rejects a record larger than one page', () => {
    expect(() => chunkRecords([{ value: 'a'.repeat(MAX_PAGE_BYTES) }])).toThrow('storage page limit');
  });

  it('rejects an unbounded atomic batch', () => {
    expect(() => chunkRecords(Array.from({ length: MAX_MUTATION_RECORDS + 1 }))).toThrow(
      'split it into explicit batches',
    );
  });
});
