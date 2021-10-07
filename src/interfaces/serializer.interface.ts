export interface ISerializer {
  serialize(payload:any):any;
  deserialize(payload:Buffer):any;
}