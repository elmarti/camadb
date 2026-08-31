import { ISerializer } from '../interfaces/serializer.interface';

export class SerializerMock implements ISerializer {
  deserialize(payload: Buffer): any {
    return {}
  }

  serialize(payload: any): any {
    return "";
  }

}