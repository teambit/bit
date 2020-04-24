import EventEmitter from 'events';

export enum LogLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  DEBUG = 'debug'
}
export type LogEntry = {
  componentId: string; // TODO: actual ComponentID
  messages: [any];
  logLevel: LogLevel;
};

export type LogPublisher = {
  info: (...any) => void;
  warn: (...any) => void;
  error: (...any) => void;
  debug: (...any) => void;
};

export default class Logger {
  private eventEmitter = new EventEmitter();
  createLogPublisher(extensionName: string): LogPublisher {
    const emitter = this.eventEmitter;
    return {
      info(componentId, messages) {
        emitter.emit(extensionName, { componentId, messages, logLevel: 'info' });
      },
      warn(componentId, messages) {
        emitter.emit(extensionName, { componentId, messages, logLevel: 'warn' });
      },
      error(componentId, messages) {
        emitter.emit(extensionName, { componentId, messages, logLevel: 'error' });
      },
      debug(componentId, messages) {
        emitter.emit(extensionName, { componentId, messages, logLevel: 'debug' });
      }
    };
  }
  subscribe(extensionName: string, cb: (LogEntry) => void) {
    this.eventEmitter.on(extensionName, (logEntry: LogEntry) => {
      cb(logEntry);
    });
  }
  unsubscribe(extensionName: string) {
    this.eventEmitter.removeAllListeners(extensionName);
  }
}
