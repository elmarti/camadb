import { LogLevel } from './logger-level.enum';

export interface ILogger {
  log(level: LogLevel, data: any): void;
  startTimer(): string;
  endTimer(level: LogLevel, pointer:string, message?:string):void;

}