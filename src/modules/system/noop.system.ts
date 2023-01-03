import { inject, injectable } from 'inversify';
import { ISystem } from '../../interfaces/system.interface';
import { TYPES } from '../../types';
import { ICamaConfig } from '../../interfaces/cama-config.interface';


@injectable()
export class NoopSystem implements ISystem {
  constructor(@inject(TYPES.CamaConfig) private config: ICamaConfig){
  }
  getOutputPath(): string {
    return 'noop';
  }

}