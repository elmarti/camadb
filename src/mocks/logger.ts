import { ILogger } from '../interfaces/logger.interface';
import { LogLevel } from '../interfaces/logger-level.enum';


export class LoggerMock implements ILogger {
  endTimer(level: LogLevel, pointer: string, message?: string): void {
  }

  log(level: LogLevel, data: any): void {
  }

  startTimer(): string {
    return '';
  }

}