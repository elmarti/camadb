

export function batchArray<T>(array:Array<T>, batchLength = 10000): Array<Array<T>>   {
  const input = [...array];
  const output = [];
  while(input.length){
    output.push(input.splice(0, batchLength));
  }
  return output;
}