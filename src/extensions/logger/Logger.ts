/* eslint-disable @typescript-eslint/no-unused-vars */
//  will be removed upon implementation ^

/**
 * Reuseable logger written in the context of extensions.
 */
export class Logger {
  log(extension: Extension, ...message: string[]): void {}
  warn(extension: Extension, ...message: string[]): void {}
  error(extension: Extension, ...message: string[]): void {}
  debug(extension: Extension, ...message: string[]): void {}

  query(query?: LogQuery): LogEntry {
    return {} as any;
  }
}

export interface LogQuery {
  extension: string;
  level: any;
  startTime?: Date;
  endTime?: Date;
}

export interface LogEntry {
  entry: string;
  time: Date;
  name: string;
  level: any;
}

export interface LogLevel {
  DEBUG: any;
}
