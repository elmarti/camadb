import { ISerializer } from '../../interfaces/serializer.interface';
import { injectable } from 'inversify';
const {parse, stringify} = require('flatted');

@injectable()
export class SiaSerializer implements ISerializer {

  deserialize(payload: any): any {
    console.log('deserializing');
    console.time('deserialized');
    const result = parse(payload);
    console.timeEnd('deserialized');
    return result;
  }

  serialize(payload: any): any {
    console.log('serializing');
    console.time('serialized');
    const result = stringify(payload);
    console.timeEnd('serialized');
    return result;
  }

}