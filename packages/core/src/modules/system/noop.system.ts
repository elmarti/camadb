import { ISystem } from '../../interfaces/system.interface';
import { TYPES } from '../../types';
import { ICamaConfig } from '../../interfaces/cama-config.interface';


export class NoopSystem implements ISystem {
  constructor(private config: ICamaConfig){
  }
  getOutputPath(): string {
    return 'noop';
  }

}