import { Environments } from '../environments';
import { ReactEnv } from './react.env';
import { Logger, LoggerExt } from '../logger';
import { JestExtension } from '../jest';
import { TypescriptExtension } from '../typescript';
import { Compile, CompileExt } from '../compile';
import { TesterExtension } from '../tester';

export type ReactConfig = {
  writeDist: boolean;
  compiler: {};
};

export class React {
  static dependencies = [Environments, LoggerExt, JestExtension, TypescriptExtension, CompileExt, TesterExtension];

  // createTsCompiler(tsconfig: {}) {}

  setTsConfig() {}

  // @typescript-eslint/no-unused-vars
  static provider([envs, logger, jest, ts, compile, tester]: [
    Environments,
    Logger,
    JestExtension,
    TypescriptExtension,
    Compile,
    TesterExtension
  ]) {
    // support factories from harmony?
    envs.registerEnv(new ReactEnv(logger.createLogPublisher(this.name), jest, ts, compile, tester));
    return {};
  }
}
