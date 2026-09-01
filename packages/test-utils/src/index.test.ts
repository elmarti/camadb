import { createRows } from './index';

it('creates deterministic rows', () => {
  expect(createRows(2)).toEqual([
    { _id: '0', value: 'row-0' },
    { _id: '1', value: 'row-1' },
  ]);
});
