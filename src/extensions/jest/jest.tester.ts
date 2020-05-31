import { runCLI, run } from 'jest';
import { join } from 'path';
import { Tester, TestResults, TesterContext } from '../tester';

export class JestTester implements Tester {
  constructor(readonly jestConfig: any) {}

  async test(context: TesterContext): Promise<TestResults> {
    const config: any = {
      rootDir: context.workspace.path
    };

    // match all component test files
    // hack alert!! should be provided by component data e.g. @gilad and done by the tester extension on component load.
    const testMatch = context.components.reduce((acc: string[], current) => {
      const paths = current.filesystem
        .readdirSync('/')
        .filter(path => {
          const testerConfig = current.config.extensions.findExtension('@teambit/tester')?.data;
          // should be used as a default value.
          return path.match(testerConfig?.testRegex || '(/__tests__/.*|(\\.|/)(test|spec))\\.[jt]sx?$');
        })
        .map(path => {
          return join(context.workspace.path, current.state._consumer.componentMap?.getComponentDir(), path);
        });

      acc = acc.concat(paths);
      return acc;
    }, []);

    // eslint-disable-next-line
    const jestConfig = require(this.jestConfig);
    Object.assign(jestConfig, {
      testMatch
    });

    Object.assign(config, jestConfig);
    // :TODO he we should match results to components and format them accordingly.
    const res = await runCLI(config, [this.jestConfig]);
    return {
      total: 50
    };
  }
}
