import { Logger } from '@teambit/logger';
import { EnvService, ExecutionContext } from '@teambit/environments';
import { ComponentMap } from '@teambit/component';
import { Workspace } from '@teambit/workspace';
import chalk from 'chalk';

import { NoTestFilesFound } from './exceptions';
import { Tester, Tests, TestsWatchResults } from './tester';
import { TesterOptions } from './tester.main.runtime';
import { detectTestFiles } from './utils';

export class TesterService implements EnvService<Tests | TestsWatchResults> {
  constructor(
    readonly workspace: Workspace,
    /**
     * regex used to identify which files to test.
     */
    readonly testsRegex: string,

    private logger: Logger
  ) {}

  async run(context: ExecutionContext, options: TesterOptions): Promise<Tests | TestsWatchResults> {
    const tester: Tester = context.env.getTester();
    const specFiles = ComponentMap.as(context.components, detectTestFiles);
    const testCount = specFiles.toArray().reduce((acc, [, specs]) => acc + specs.length, 0);
    const componentWithTests = specFiles.toArray().reduce((acc: number, [, specs]) => {
      if (specs.length > 0) acc += 1;
      return acc;
    }, 0);
    if (testCount === 0) throw new NoTestFilesFound(this.testsRegex);

    this.logger.console(`testing ${componentWithTests} components with environment ${chalk.cyan(context.id)}\n`);

    const testerContext = Object.assign(context, {
      release: false,
      specFiles,
      rootPath: this.workspace.path,
      workspace: this.workspace,
      watch: options.watch,
      debug: options.debug,
    });

    if (options.watch) return tester.watch(testerContext);
    return tester.test(testerContext);
  }
}
