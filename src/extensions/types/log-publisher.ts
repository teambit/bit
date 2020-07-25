import { LogLongProcess } from '../logger/long-process-logger';

export type LogPublisher = {
  silly: (...any) => void;
  debug: (...any) => void;
  info: (...any) => void;
  warn: (...any) => void;
  error: (...any) => void;
  createLongProcessLogger: (message: string, totalItems: number) => LogLongProcess;
};
