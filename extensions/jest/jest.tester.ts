import { Tester, TesterContext, TestResults } from '@teambit/tester';
import { runCLI } from 'jest';

export class JestTester implements Tester {
  constructor(readonly jestConfig: any) {}

  async test(context: TesterContext): Promise<TestResults> {
    const config: any = {
      rootDir: context.rootPath,
      watch: context.watch,
      runInBand: context.debug,
    };

    // eslint-disable-next-line
    const jestConfig = require(this.jestConfig);
    Object.assign(jestConfig, {
      testMatch: context.specFiles,
    });

    Object.assign(config, jestConfig);
    // :TODO he we should match results to components and format them accordingly. (e.g. const results = runCLI(...))
    await runCLI(config, [this.jestConfig]);
    return {
      total: 50,
    };
  }
}
