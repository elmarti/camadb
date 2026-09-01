export const createRows = (count: number): Array<{ _id: string; value: string }> =>
  Array.from({ length: count }, (_, index) => ({ _id: String(index), value: `row-${index}` }));
