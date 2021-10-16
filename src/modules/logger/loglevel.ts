import { inject, injectable } from 'inversify';
import { ILogger } from '../../interfaces/logger.interface';
import { LogLevel } from '../../interfaces/logger-level.enum';
import { TYPES } from '../../types';
import { ICamaConfig } from '../../interfaces/cama-config.interface';


@injectable()
export class LoglevelLogger implements ILogger {

  //Not so sure about this
  private profilerMap:any = {};
  private logger: any;
  constructor(
    @inject(TYPES.CamaConfig) private config: ICamaConfig,
  ) {
    if(config.logLevel) {

      this.logger = require('loglevel');
      this.logger.setLevel(config.logLevel as any);
    }
  }
  log(level: LogLevel, message:any): void {
    if(this.logger){
      this.logger[level]({
        level,
        message
      })
    }
  }
  startTimer(): string {
    // const pointer = v4uuid();
    // this.profilerMap[pointer] = this.logger?.startTimer();
    // return pointer;
    return "";
  }

  endTimer(level: LogLevel, pointer:string, message =""): void {
    // this.profilerMap[pointer]?.done({
    //   level,
    //   message
    // })
    // delete this.profilerMap[pointer];

  }

}