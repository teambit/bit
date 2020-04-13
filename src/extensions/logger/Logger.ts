/* eslint-disable @typescript-eslint/no-unused-vars */
export class Logger {
  log(...message: string[]) {}
  warn(...message: string[]) {}
  error(...message: string[]) {}
  debug(...message: string[]) {}

  query(query?: LogQuery): LogEntry {
    return {} as any;
  }
  queryMany(query: LogQuery[]) {}

  subscribe(query?: LogQuery) {}
  subscribeMany(query: LogQuery[]) {}
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
