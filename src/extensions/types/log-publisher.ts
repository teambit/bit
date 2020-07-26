import { LongProcessLogger } from '../logger/long-process-logger';

export type LogPublisher = {
  silly: (...any) => void;
  debug: (...any) => void;
  info: (...any) => void;
  warn: (...any) => void;
  error: (...any) => void;
  /**
   * use it for a long running process. upon creation it logs the `processDescription`.
   * if the process involves iteration over a list of items, such as running tag on a list of
   * components, then pass the `totalItems` as the total of the total components in the list.
   * later, during the iteration, call `LongProcessLogger.logProgress(componentName)`.
   * once done, call `LongProcessLogger.end()`
   * if the reporter is used, the status-line will show all messages in the terminal.
   */
  createLongProcessLogger: (processDescription: string, totalItems?: number) => LongProcessLogger;
};
