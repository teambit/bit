import { MainRuntime } from '@teambit/cli';
import { LoggerAspect, LoggerMain, Logger } from '@teambit/logger';
import { WorkerAspect, WorkerMain, HarmonyWorker } from '@teambit/worker';
import { JestAspect } from './jest.aspect';
import { JestTester } from './jest.tester';
import type { JestWorker } from './jest.worker';

const jestM = require('jest');

export const WORKER_NAME = 'jest';

export class JestMain {
  constructor(private jestWorker: HarmonyWorker<JestWorker>, private logger: Logger) {}

  createTester(jestConfig: any, jestModule = jestM) {
    return new JestTester(JestAspect.id, jestConfig, jestModule, this.jestWorker, this.logger);
  }

  static runtime = MainRuntime;
  static dependencies = [WorkerAspect, LoggerAspect];

  static async provider([worker, loggerAspect]: [WorkerMain, LoggerMain]) {
    const logger = loggerAspect.createLogger(JestAspect.id);
    const jestWorker = await worker.declareWorker<JestWorker>(WORKER_NAME, require.resolve('./jest.worker'));
    return new JestMain(jestWorker, logger);
  }
}

JestAspect.addRuntime(JestMain);
