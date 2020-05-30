import { Tester, TestResults, TesterContext } from '../tester';

export class JestTester implements Tester {
  async test(context: TesterContext): Promise<TestResults> {
    return {
      total: 50
    };
  }
}
