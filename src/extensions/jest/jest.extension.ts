import { JestTester } from './jest.tester';

export class JestExtension {
  static dependencies = [];

  createTester() {
    return new JestTester();
  }

  static provider() {
    return new JestExtension();
  }
}
