import { Environments } from '../environments';
import { ReactEnv } from './react.env';
import { Logger, LoggerExt } from '../logger';

export class React {
  static dependencies = [Environments, LoggerExt];

  static provider([envs, logger]: [Environments, Logger]) {
    // support factories from harmony?
    envs.register(new ReactEnv(logger.createLogPublisher(this.name)));
    return {};
  }
}
