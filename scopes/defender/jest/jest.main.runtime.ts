import { MainRuntime } from '@teambit/cli';
import { WorkerAspect, WorkerMain, HarmonyWorker } from '@teambit/worker';
import { JestAspect } from './jest.aspect';
import { JestTester } from './jest.tester';
import type { JestWorker } from './jest.worker';

const jest = require('jest');

export const WORKER_NAME = 'jest';

export class JestMain {
  constructor(private jestWorker: HarmonyWorker<JestWorker>) {}

  createTester(jestConfig: any, jestModule = jest) {
    return new JestTester(JestAspect.id, jestConfig, jestModule, this.jestWorker);
  }

  static runtime = MainRuntime;
  static dependencies = [WorkerAspect];

  static async provider([worker]: [WorkerMain]) {
    const jestWorker = await worker.declareWorker<JestWorker>(WORKER_NAME);
    return new JestMain(jestWorker);
  }
}

JestAspect.addRuntime(JestMain);
