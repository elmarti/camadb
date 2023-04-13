// batchArray.test.ts

import { batchArray } from '../batch-array';

describe('batchArray', () => {
  it('should return the input array as a single batch if its length is less than or equal to the batchLength', () => {
    const inputArray = [1, 2, 3, 4, 5];
    const batchLength = 5;
    const expectedResult = [[1, 2, 3, 4, 5]];

    expect(batchArray(inputArray, batchLength)).toEqual(expectedResult);
  });

  it('should return the input array as multiple batches if its length is greater than the batchLength', () => {
    const inputArray = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const batchLength = 5;
    const expectedResult = [
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
    ];

    expect(batchArray(inputArray, batchLength)).toEqual(expectedResult);
  });

  it('should return the input array in batches of the default batchLength when no batchLength is provided', () => {
    const inputArray = Array.from({ length: 15000 }, (_, i) => i + 1);
    const expectedResult = [
      Array.from({ length: 10000 }, (_, i) => i + 1),
      Array.from({ length: 5000 }, (_, i) => i + 10001),
    ];

    expect(batchArray(inputArray)).toEqual(expectedResult);
  });

  it('should return an empty array when the input array is empty', () => {
    const inputArray: number[] = [];
    const expectedResult: number[][] = [];

    expect(batchArray(inputArray)).toEqual(expectedResult);
  });
});
