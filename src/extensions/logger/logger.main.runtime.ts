import { LoggerAspect } from './logger.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { Logger } from './logger';

export class LoggerMain {
  static runtime = MainRuntime;
  static dependencies = [];
  createLogger(extensionName: string): Logger {
    return new Logger(extensionName);
  }
  static async provider() {
    return new LoggerMain();
  }
}

LoggerAspect.addRuntime(LoggerMain);
