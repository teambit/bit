import { Environments } from '../environments';
import { ReactEnv } from './react.env';
import { Logger, LoggerExt } from '../logger';
import { JestExtension } from '../jest';
import { TypescriptExtension } from '../typescript';

export type ReactConfig = {
  writeDist: boolean;
  compiler: {};
};

export class React {
  static dependencies = [Environments, LoggerExt, JestExtension, TypescriptExtension];

  createTsCompiler(tsconfig: {}) {}

  setTsConfig() {}

  // @typescript-eslint/no-unused-vars
  static provider([envs, logger, jest, ts]: [Environments, Logger, JestExtension, TypescriptExtension]) {
    // support factories from harmony?
    envs.registerEnv(new ReactEnv(logger.createLogPublisher(this.name), jest, ts));
    return {};
  }
}
