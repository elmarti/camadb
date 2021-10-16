import { ISerializer } from '../interfaces/serializer.interface';
import { injectable } from 'inversify';

@injectable()
export class SerializerMock implements ISerializer {
  deserialize(payload: Buffer): any {
    return {}
  }

  serialize(payload: any): any {
    return "";
  }

}