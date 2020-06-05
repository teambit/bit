import { runCLI } from 'jest';
import { Tester, TestResults, TesterContext } from '../tester';

export class JestTester implements Tester {
  constructor(readonly jestConfig: any) {}

  async test(context: TesterContext): Promise<TestResults> {
    const config: any = {
      rootDir: context.rootPath
    };

    // eslint-disable-next-line
    const jestConfig = require(this.jestConfig);
    Object.assign(jestConfig, {
      testMatch: context.specFiles
    });

    Object.assign(config, jestConfig);
    // :TODO he we should match results to components and format them accordingly. (e.g. const results = runCLI(...))
    await runCLI(config, [this.jestConfig]);
    return {
      total: 50
    };
  }
}
