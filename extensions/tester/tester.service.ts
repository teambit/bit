import { Logger } from '@teambit/logger';
import { EnvService, ExecutionContext } from '@teambit/environments';
import { Workspace } from '@teambit/workspace';
import { join } from 'path';
import chalk from 'chalk';

import { NoTestFilesFound } from './exceptions';
import { Tester, TestResults } from './tester';
import { TesterOptions } from './tester.main.runtime';
import { detectTestFiles } from './utils';

export class TesterService implements EnvService<TestResults> {
  constructor(
    readonly workspace: Workspace,
    /**
     * regex used to identify which files to test.
     */
    readonly testsRegex: string,

    private logger: Logger
  ) {}

  async run(context: ExecutionContext, options: TesterOptions): Promise<TestResults> {
    const tester: Tester = context.env.getTester();
    const components = detectTestFiles(context.components);

    const testMatch = components.reduce((acc: string[], component: any) => {
      const specs = component.specs.map((specFile) =>
        join(this.workspace.componentDir(component.id, { ignoreVersion: true }, { relative: false }), specFile)
      );

      acc = acc.concat(specs);
      return acc;
    }, []);

    if (!testMatch.length) {
      throw new NoTestFilesFound(this.testsRegex);
    }

    this.logger.console(`testing ${context.components.length} components with environment ${chalk.cyan(context.id)}\n`);

    const testerContext = Object.assign(context, {
      release: false,
      specFiles: testMatch,
      rootPath: this.workspace.path,
      workspace: this.workspace,
      watch: options.watch,
      debug: options.debug,
    });

    return tester.test(testerContext);
  }
}
