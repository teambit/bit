import { MainRuntime } from '@teambit/cli';

import { Logger } from './logger';
import { LoggerAspect } from './logger.aspect';

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
