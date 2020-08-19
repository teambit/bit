import { JestAspect } from './jest.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { JestTester } from './jest.tester';

export class JestExtension {
  static id = '@teambit/jest';
  static runtime = MainRuntime;
  static dependencies = [];

  createTester(jestConfig: any) {
    return new JestTester(jestConfig);
  }

  static provider() {
    return new JestExtension();
  }
}

JestAspect.addRuntime(JestMain);
