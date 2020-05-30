import { Environments } from '../environments';
import { ReactEnv } from './react.env';
import { Logger, LoggerExt } from '../logger';
import { JestExtension } from '../jest';

export type ReactConfig = {
  writeDist: boolean;
  compiler: {};
};

export class React {
  static dependencies = [Environments, LoggerExt, JestExtension];

  createTsCompiler(tsconfig: {}) {}

  setTsConfig() {}

  // @typescript-eslint/no-unused-vars
  static provider([envs, logger, jest]: [Environments, Logger, JestExtension]) {
    // support factories from harmony?
    envs.registerEnv(new ReactEnv(logger.createLogPublisher(this.name), jest));
    return {};
  }
}
