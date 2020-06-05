import { EventEmitter } from 'events';
// TODO: change to module path once types become a component
import { LogPublisher } from '../types';

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
