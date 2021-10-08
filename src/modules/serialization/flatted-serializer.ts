import { ISerializer } from '../../interfaces/serializer.interface';
import { injectable } from 'inversify';
const {parse, stringify} = require('flatted');

@injectable()
export class FlattedSerializer implements ISerializer {

  deserialize(payload: any): any {
    const result = parse(payload);
    return result;
  }

  serialize(payload: any): any {
    const result = stringify(payload);
    return result;
  }

}