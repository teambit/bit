import { runCLI, run } from 'jest';
import { Tester, TestResults, TesterContext } from '../tester';

export class JestTester implements Tester {
  constructor(readonly jestConfig: any) {}

  async test(context: TesterContext): Promise<TestResults> {
    const config: any = {
      rootDir: context.workspace.path
    };

    // eslint-disable-next-line
    Object.assign(config, require(this.jestConfig));
    const res = await runCLI(config, [this.jestConfig]);
    return {
      total: 50
    };
  }
}
