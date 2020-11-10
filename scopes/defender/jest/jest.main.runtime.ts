import { MainRuntime } from '@teambit/cli';
import { JestAspect } from './jest.aspect';
import { JestTester } from './jest.tester';

const jest = require('jest');

export class JestMain {
  static runtime = MainRuntime;
  static dependencies = [];

  createTester(jestConfig: any, jestModule = jest) {
    return new JestTester(JestAspect.id, jestConfig, jestModule);
  }

  static async provider() {
    return new JestMain();
  }
}

JestAspect.addRuntime(JestMain);
