import { LogPublisher } from './log-publisher';

export default class Logger {
  createLogPublisher(extensionName: string): LogPublisher {
    return new LogPublisher(extensionName);
  }
}
