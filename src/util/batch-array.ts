/**
 * Break an array down into smaller batches
 * @param array - The array to be batched
 * @param batchLength - The length of the batches
 */
export function batchArray<T>(array:Array<T>, batchLength = 10000): Array<Array<T>>   {
  const input = [...array];
  const output = [];
  while(input.length){
    output.push(input.splice(0, batchLength));
  }
  return output;
}