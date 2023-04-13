import { LoglevelLogger } from "../loglevel";
import { ICamaConfig } from "../../../interfaces/cama-config.interface";
import { LogLevel } from "../../../interfaces/logger-level.enum";
import { PersistenceAdapterEnum } from "../../../interfaces/perisistence-adapter.enum";

describe("LoglevelLogger", () => {
  let logger: LoglevelLogger;
  const camaConfig: ICamaConfig = {
    logLevel: LogLevel.Debug,
    persistenceAdapter: PersistenceAdapterEnum.InMemory
  };

  beforeEach(() => {
    logger = new LoglevelLogger(camaConfig);
  });

  it("should set the log level if it is provided in the config", () => {
    expect(logger["logger"].getLevel()).toEqual(1);
  });

  it("should not set the log level if it is not provided in the config", () => {
    const newLogger = new LoglevelLogger({
      persistenceAdapter: PersistenceAdapterEnum.InMemory
    });
    expect(newLogger["logger"]).toBeUndefined();
  });

  it("should log a message with the specified log level", () => {
    const spy = jest.spyOn(logger["logger"], "debug");
    logger.log(LogLevel.Debug, "test");
    expect(spy).toHaveBeenCalledWith({ level: LogLevel.Debug, message: "test" });
  });

  it("should start and end a timer", () => {
    const pointer = logger.startTimer();
    expect(pointer).toEqual("");
    logger.endTimer(LogLevel.Debug, pointer, "test");
    // check that the timer was started and stopped
  });
});
