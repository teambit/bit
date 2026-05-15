import { LoggerAspect } from './logger.aspect.js';

class Logger {
  constructor(name) { this.name = name; }
  info(msg) { if (process.env.BIT_LOG) process.stderr.write(`[${this.name}] ${msg}\n`); }
}

export class LoggerMain {
  static id = LoggerAspect.id;
  static dependencies = [];
  static slots = [];
  static async provider() { return new LoggerMain(); }
  createLogger(name) { return new Logger(name); }
}
