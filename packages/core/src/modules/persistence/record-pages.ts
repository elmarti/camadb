export const MAX_PAGE_BYTES = 1024 * 1024;
export const MAX_PAGE_RECORDS = 512;
export const MAX_MUTATION_RECORDS = 10_000;

export const assertMutationBound = (recordCount: number): void => {
  if (recordCount > MAX_MUTATION_RECORDS) {
    throw new Error(`Atomic mutation exceeds the ${MAX_MUTATION_RECORDS}-record limit; split it into explicit batches`);
  }
};

/** Split records without allowing document size or count to defeat page bounds. */
export const chunkRecords = <T>(records: T[]): T[][] => {
  assertMutationBound(records.length);
  const encoder = new TextEncoder();
  const pages: T[][] = [];
  let page: T[] = [];
  let pageBytes = 2;

  for (const record of records) {
    const bytes = encoder.encode(JSON.stringify(record)).byteLength;
    if (bytes > MAX_PAGE_BYTES - 2) {
      throw new Error(`Record exceeds the ${MAX_PAGE_BYTES}-byte storage page limit`);
    }
    if (page.length >= MAX_PAGE_RECORDS || (page.length > 0 && pageBytes + bytes + 1 > MAX_PAGE_BYTES)) {
      pages.push(page);
      page = [];
      pageBytes = 2;
    }
    page.push(record);
    pageBytes += bytes + (page.length > 1 ? 1 : 0);
  }
  if (page.length > 0) pages.push(page);
  return pages;
};
