import { batchArray } from '../batch-array';

it('works with a simple dataset', () => {
  const testArray = [1,2,3,4,5,6,7,8,9,10];
  const expectedOutput =  [ [ 1, 2 ], [ 3, 4 ], [ 5, 6 ], [ 7, 8 ], [ 9, 10 ] ];
  const batchedArray = batchArray(testArray, 2);
  expect(batchedArray).toEqual(expectedOutput);
});

it('handles outliers correctly', () => {
  const testArray = [1];
  const expectedOutput =  [ [1] ];
  const batchedArray = batchArray(testArray, 2);
  expect(batchedArray).toEqual(expectedOutput);
});
it('handles empty arrays correctly', () => {
  const testArray: Array<number> = [];
  const expectedOutput: Array<number> =  [ ];
  const batchedArray = batchArray(testArray, 2);
  expect(batchedArray).toEqual(expectedOutput);
});
