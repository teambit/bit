import { MainRuntime } from '@teambit/cli';
import type { TransformOptions } from '@babel/core';
import type Mocha from 'mocha';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import { MochaTester } from '@teambit/defender.mocha-tester';
import { MochaAspect } from './mocha.aspect';

export class MochaMain {
  constructor(private logger: Logger) {}

  createTester(
    mochaConfig: Mocha.MochaOptions = {},
    babelConfig: TransformOptions = {},
    // eslint-disable-next-line global-require
    mochaModule = require('mocha')
  ) {
    return new MochaTester(MochaAspect.id, this.logger, mochaConfig, babelConfig, mochaModule);
  }

  static slots = [];
  static dependencies = [LoggerAspect];
  static runtime = MainRuntime;
  static async provider([loggerMain]: [LoggerMain]) {
    const logger = loggerMain.createLogger(MochaAspect.id);
    return new MochaMain(logger);
  }
}

MochaAspect.addRuntime(MochaMain);
