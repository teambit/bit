import { EventEmitter } from 'events';

// we use this and not EventEmitter directly in order to be able
// to provide tab completions for intellisense(-like) IDEs
export default class Logger {
  private eventEmitter = new EventEmitter();
  info(...messages) {
    this.eventEmitter.emit('info', messages);
  }
  warn(...messages) {
    this.eventEmitter.emit('warn', messages);
  }
  error(...messages) {
    this.eventEmitter.emit('error', messages);
  }
  debug(...messages) {
    this.eventEmitter.emit('debug', messages);
  }
  onInfo(cb) {
    this.eventEmitter.on('info', cb);
  }
  onWarn(cb) {
    this.eventEmitter.on('warn', cb);
  }
  onError(cb) {
    this.eventEmitter.on('error', cb);
  }
  onDebug(cb) {
    this.eventEmitter.on('debug', cb);
  }
}
