export const createRows = (count: number): Array<{ _id: number; value: string }> =>
  Array.from({ length: count }, (_, _id) => ({ _id, value: `row-${_id}` }));
