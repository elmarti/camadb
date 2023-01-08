import { inject, injectable } from 'inversify';
import * as path from 'path';
import { ISystem } from '../../interfaces/system.interface';
import { TYPES } from '../../types';
import { ICamaConfig } from '../../interfaces/cama-config.interface';


@injectable()
export class NodeSystem implements ISystem {
  constructor(@inject(TYPES.CamaConfig) private config: ICamaConfig){
  }
  getOutputPath(): string {
    return this.config.path || path.join(process.cwd(), './.cama');
  }

}