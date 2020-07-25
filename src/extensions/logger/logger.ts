import { EventEmitter } from 'events';
// TODO: change to module path once types become a component
import { LogPublisher } from '../types';
import legacyLogger from '../../logger/logger';
import { LogLongProcess } from './long-process-logger';

export enum LogLevel {
  SILLY = 'silly',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}
export type LogEntry = {
  componentId: string; // TODO: actual ComponentID
  messages: [any];
  logLevel: LogLevel;
};

export default class Logger {
  private eventEmitter = new EventEmitter();
  private subscribers: string[] = [];
  createLogPublisher(extensionName: string): LogPublisher {
    if (extensionName && !this.subscribers.includes(extensionName)) {
      this.subscribers.push(extensionName);
    }
    const emitter = this.eventEmitter;
    const emitAndLogToFile = (componentId, messages, logLevel) => {
      emitter.emit(extensionName, { componentId, messages, logLevel });
      legacyLogger[logLevel](`${componentId}, ${messages}`);
    };
    return {
      silly(componentId, messages) {
        emitAndLogToFile(componentId, messages, 'debug');
      },
      debug(componentId, messages) {
        emitAndLogToFile(componentId, messages, 'debug');
      },
      info(componentId, messages) {
        emitAndLogToFile(componentId, messages, 'info');
      },
      warn(componentId, messages) {
        emitAndLogToFile(componentId, messages, 'warn');
      },
      error(componentId, messages) {
        emitAndLogToFile(componentId, messages, 'error');
      },
      createLongProcessLogger(processDescription: string, totalItems?: number): LogLongProcess {
        return new LogLongProcess(this, extensionName, emitter, processDescription, totalItems);
      },
    };
  }
  subscribe(extensionName: string, cb: (LogEntry) => void) {
    this.eventEmitter.on(extensionName, (logEntry: LogEntry) => {
      cb(logEntry);
    });
  }
  subscribeAll(cb: (LogEntry) => void) {
    this.subscribers.forEach((extensionName) => {
      this.eventEmitter.on(extensionName, (logEntry: LogEntry) => {
        cb(logEntry);
      });
    });
  }
  unsubscribe(extensionName: string) {
    this.eventEmitter.removeAllListeners(extensionName);
  }
}
