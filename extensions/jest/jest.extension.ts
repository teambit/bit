import { JestTester } from './jest.tester';

export class JestExtension {
  static id = '@teambit/jest';
  static dependencies = [];

  createTester(jestConfig: any) {
    return new JestTester(jestConfig);
  }

  static provider() {
    return new JestExtension();
  }
}
