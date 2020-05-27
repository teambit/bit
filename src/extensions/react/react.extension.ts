import { Environments } from '../environments';
import { ReactEnv } from './react.env';
import { Logger, LoggerExt } from '../logger';

export type ReactConfig = {
  writeDist: boolean;
  compiler: {};
};

export class React {
  static dependencies = [Environments, LoggerExt];

  // @typescript-eslint/no-unused-vars
  static provider([envs, logger]: [Environments, Logger]) {
    // support factories from harmony?
    envs.register(new ReactEnv(logger.createLogPublisher(this.name)));
    return {};
  }
}
