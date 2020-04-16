//  will be removed upon implementation
/* eslint-disable @typescript-eslint/no-unused-vars */
// eslint-disable-next-line max-classes-per-file
import { Extension } from '@teambit/harmony';

/**
 * Reuseable logger written in the context of extensions.
 */

export class Logger {
  /**
   * Creates a log one or more log entries in log level DEBUG.
   *
   * @param label - Name of log topic.
   * @param message - string to write to log
   */
  debug(label: string, ...messages: string[]): void {}

  /**
   * Creates a log one or more log entries in level LOG.
   *
   * @param label - Name of log topic.
   * @param message - string to write to the log
   */
  log(label: string, ...messages: string[]): void {}

  /**
   * Creates a log one or more log entries in level WARN.
   *
   * @param label - Name of log topic.
   * @param message - string to write to log
   */
  warn(label: string, ...message: string[]): void {}

  /**
   * Creates a log one or more log entries in log level ERROR.
   *
   * @param label - Name of log topic.
   * @param message - string to write to log
   */
  error(label: string, ...message: string[]): void {}

  /**
   *
   * Listen to entries being written to the LOG.
   *
   * @param callback - Fires on each entry in the log.
   * @param range - A filter to apply on the listen function
   *
   * @example ```this.logger(function(){})```
   * @example ```this.logger(function(){},{start:20, end:100})```
   */
  listen(callback: (entry: LogEntry) => void, range?: LogRange) {}

  private write(level: string, label: string, msg: string) {}
}

// cant use enum, not supported in babel build
export const Level: 'DEBUG' | 'LOG' | 'WARN' | 'DEBUG' = 'LOG';

export interface LogEntry {
  message: string;
  level: typeof Level;
  time: Date;
}

/**
 * Describes a range of logs
 */
export interface LogRange {
  /**
   * defaults to start of process.
   */
  start?: Date;

  /**
   * defaults to Date.now()
   */
  end?: Date;

  /**
   * defaults to error
   */
  level?: typeof Level;

  /**
   * defaults to all
   */
  label?: string;
}
