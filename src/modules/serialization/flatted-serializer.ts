import { ISerializer } from '../../interfaces/serializer.interface';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../types';
import { ILogger } from '../../interfaces/logger.interface';
import { LogLevel } from '../../interfaces/logger-level.enum';

const {parse, stringify} = require('flatted');

@injectable()
export class FlattedSerializer implements ISerializer {
  constructor(@inject(TYPES.Logger) private logger:ILogger) {
  }

  deserialize(payload: any): any {
    const pointer = this.logger.startTimer();
    const result = parse(payload);
    this.logger.endTimer(LogLevel.Perf, pointer, 'deserialize')
    return result;
  }

  serialize(payload: any): any {
    const pointer = this.logger.startTimer();
    const result = stringify(payload);
    this.logger.endTimer(LogLevel.Perf, pointer, 'serialize')

    return result;
  }

}