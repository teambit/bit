import { Logger } from './logger';

export class LoggerExtension {
  static id = '@teambit/logger';
  static dependencies = [];
  createLogger(extensionName: string): Logger {
    return new Logger(extensionName);
  }
  static async provider() {
    return new LoggerExtension();
  }
}
