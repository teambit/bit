export interface Logger {
  log(...message: string[]);
  warn(...message: string[]);
  error(...message: string[]);
  debug(...message: string[]);
  query(query?: LogQuery);
  queryMany(query: LogQuery[]);
  subscribe(query?: LogQuery);
  subscribeMany(query: LogQuery[]);
}

export interface LogQuery {
  extension: string;
  startTime?: Date;
  endTime?: Date;
}
