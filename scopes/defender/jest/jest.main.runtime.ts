import { MainRuntime } from '@teambit/cli';
import type { LoggerMain, Logger } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { WorkerMain, HarmonyWorker } from '@teambit/worker';
import { WorkerAspect } from '@teambit/worker';
import { getCloudDomain } from '@teambit/legacy.constants';
import { JestAspect } from './jest.aspect';
import type { JestTesterOptions } from './jest.tester';
import { JestTester } from './jest.tester';
import type { JestWorker } from './jest.worker';

export const WORKER_NAME = 'jest';

export class JestMain {
  constructor(
    private jestWorker: HarmonyWorker<JestWorker>,
    private logger: Logger
  ) {}

  /**
   * @deprecated use jest tester from https://bit.cloud/teambit/defender/jest-tester
   */
  createTester(jestConfig: any, jestModulePath = require.resolve('jest'), opts?: JestTesterOptions) {
    this.logger.consoleWarning(
      `The 'Jest' aspect is deprecated. Please use the 'jest tester' component instead. For more details, visit: https://${getCloudDomain()}/teambit/defender/jest-tester`
    );
    return new JestTester(JestAspect.id, jestConfig, jestModulePath, this.jestWorker, this.logger, opts);
  }

  static runtime = MainRuntime;
  static dependencies = [WorkerAspect, LoggerAspect];

  static async provider([worker, loggerAspect]: [WorkerMain, LoggerMain]) {
    const logger = loggerAspect.createLogger(JestAspect.id);
    // When bundled, worker files are copied to a separate directory
    let workerPath: string;
    try {
      workerPath = require.resolve('./jest.worker');
    } catch {
      // Fallback for bundled version where worker is in a separate directory
      // Use dynamic path construction to avoid esbuild resolving at build time
      const defenderPath = './defender' + '.jest/dist/jest.worker';
      workerPath = require.resolve(defenderPath);
    }
    const jestWorker = worker.declareWorker<JestWorker>(WORKER_NAME, workerPath);
    return new JestMain(jestWorker, logger);
  }
}

JestAspect.addRuntime(JestMain);
