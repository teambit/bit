import { MainRuntime } from '@teambit/cli';
import { LoggerAspect, LoggerMain, Logger } from '@teambit/logger';
import { WorkerAspect, WorkerMain, HarmonyWorker } from '@teambit/worker';
import { getCloudDomain } from '@teambit/legacy/dist/constants';
import { JestAspect } from './jest.aspect';
import { JestTester, JestTesterOptions } from './jest.tester';
import type { JestWorker } from './jest.worker';

export const WORKER_NAME = 'jest';

export class JestMain {
  constructor(private jestWorker: HarmonyWorker<JestWorker>, private logger: Logger) {}

  /**
   * @deprecated use jest tester from https://bit.cloud/teambit/defender/jest-tester
   */
  createTester(jestConfig: any, jestModulePath = require.resolve('jest'), opts?: JestTesterOptions) {
    logger.consoleWarning(
      `The 'Jest' aspect is deprecated. Please use the 'jest tester' component instead. For more details, visit: https://${getCloudDomain()}/teambit/defender/jest-tester`
    );
    return new JestTester(JestAspect.id, jestConfig, jestModulePath, this.jestWorker, this.logger, opts);
  }

  static runtime = MainRuntime;
  static dependencies = [WorkerAspect, LoggerAspect];

  static async provider([worker, loggerAspect]: [WorkerMain, LoggerMain]) {
    const logger = loggerAspect.createLogger(JestAspect.id);
    const jestWorker = worker.declareWorker<JestWorker>(WORKER_NAME, require.resolve('./jest.worker'));
    return new JestMain(jestWorker, logger);
  }
}

JestAspect.addRuntime(JestMain);
