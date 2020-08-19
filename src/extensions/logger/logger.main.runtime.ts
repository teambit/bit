import { LoggerAspect } from './logger.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { Logger } from './logger';

export class LoggerExtension {
  static id = '@teambit/logger';
  static runtime = MainRuntime;
  static dependencies = [];
  createLogger(extensionName: string): Logger {
    return new Logger(extensionName);
  }
  static async provider() {
    return new LoggerExtension();
  }
}

LoggerAspect.addRuntime(LoggerMain);
