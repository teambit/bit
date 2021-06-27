import { MainRuntime } from '@teambit/cli';
import { LoggerAspect, LoggerMain, Logger } from '@teambit/logger';
import { WorkerAspect, WorkerMain, HarmonyWorker } from '@teambit/worker';
import { WorkspaceAspect, Workspace } from '@teambit/workspace';
import { JestAspect } from './jest.aspect';
import { JestTester } from './jest.tester';
import type { JestWorker } from './jest.worker';

const jestM = require('jest');

export const WORKER_NAME = 'jest';

export class JestMain {
  constructor(
    private jestWorker: HarmonyWorker<JestWorker>,

    /**
     * Workspace extension.
     */
    private workspace: Workspace,
    /**
     * logger extension.
     */
    private logger: Logger
  ) {}

  createTester(jestConfig: any, jestModule = jestM) {
    return new JestTester(JestAspect.id, jestConfig, jestModule, this.jestWorker, this.logger, this.workspace);
  }

  static runtime = MainRuntime;
  static dependencies = [WorkerAspect, LoggerAspect, WorkspaceAspect];

  static async provider([worker, loggerAspect, workspace]: [WorkerMain, LoggerMain, Workspace]) {
    const logger = loggerAspect.createLogger(JestAspect.id);
    const jestWorker = await worker.declareWorker<JestWorker>(WORKER_NAME, require.resolve('./jest.worker'));
    return new JestMain(jestWorker, workspace, logger);
  }
}

JestAspect.addRuntime(JestMain);
