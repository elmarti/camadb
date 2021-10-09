import { inject, injectable } from 'inversify';
import { ILogger } from '../../interfaces/logger.interface';
import { LogLevel } from '../../interfaces/logger-level.enum';
import { TYPES } from '../../types';
import { ICamaConfig } from '../../interfaces/cama-config.interface';
import winston, { transports } from 'winston';
import {v4 as v4uuid} from 'uuid';

const customLogLevels = {
  levels: {
    info:0,
    perf: 1,
    debug: 2,
  },
  colors: {
    debug: 'blue',
    perf: 'green',
    info: 'yellow',
  }
};
@injectable()
export class WinstonLogger implements ILogger {

  //Not so sure about this
  private profilerMap:any = {};
  private logger?: winston.Logger;
  constructor(
    @inject(TYPES.CamaConfig) private config: ICamaConfig,
  ) {
    if(config.logLevel) {


      this.logger = winston.createLogger({
        levels: customLogLevels.levels,
        level: config.logLevel,
        format: winston.format.json(),
        transports:[
          new transports.Console({
          level: LogLevel.Debug,
          format: winston.format.combine(
            // winston.format.colorize(),
            winston.format.simple()
          )
        }),
          new transports.Console({
            level: LogLevel.Info,
            format: winston.format.combine(
              // winston.format.colorize(),
              winston.format.simple()
            )
          }),
          new transports.Console({
            level: LogLevel.Perf,
            format: winston.format.combine(
              // winston.format.colorize(),
              winston.format.simple()
            )
          }),
        ]
      });
      // winston.addColors(customLogLevels.colors);
    }
  }
  log(level: LogLevel, message:any): void {
    if(this.logger){
      this.logger.log({
        level,
        message
      })
    }
  }
  startTimer(): string {
    const pointer = v4uuid();
    this.profilerMap[pointer] = this.logger?.startTimer();
    return pointer;
  }

  endTimer(level: LogLevel, pointer:string, message =""): void {
    this.profilerMap[pointer]?.done({
      level,
      message
    })
    delete this.profilerMap[pointer];

  }

}