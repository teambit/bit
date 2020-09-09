import { Logger } from '@teambit/logger';
import { EnvService, ExecutionContext } from '@teambit/environments';
import { Component, ComponentID, ComponentMap } from '@teambit/component';
import { Workspace } from '@teambit/workspace';
import { join } from 'path';
import chalk from 'chalk';

import { NoTestFilesFound } from './exceptions';
import { Tester, TestResults } from './tester';
import { TesterOptions } from './tester.main.runtime';
import { detectTestFiles } from './utils';

type ComponentWithSpecs = Component & { specs: string[] };

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
    const specFiles = ComponentMap.as(context.components, detectTestFiles);
    const testCount = specFiles.toArray().reduce((acc, [component, specs]) => acc + specs.length, 0);
    if (testCount === 0) throw new NoTestFilesFound(this.testsRegex);

    this.logger.console(`testing ${context.components.length} components with environment ${chalk.cyan(context.id)}\n`);

    const testerContext = Object.assign(context, {
      release: false,
      specFiles,
      rootPath: this.workspace.path,
      workspace: this.workspace,
      watch: options.watch,
      debug: options.debug,
    });

    return tester.test(testerContext);
  }

  private getSpecFiles(component: Component) {
    //@ts-ignore
    return component.specs.map((specFile: string) => {
      const file = component.filesystem.files.find((file) => file.relative === specFile);
      if (!file) throw new Error('file not found');
      return file;
    });
  }
}
