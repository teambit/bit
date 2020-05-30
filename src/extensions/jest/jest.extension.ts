import { JestTester } from './jest.tester';

export class JestExtension {
  static dependencies = [];

  createTester(jestConfig: any) {
    return new JestTester(jestConfig);
  }

  static provider() {
    return new JestExtension();
  }
}
