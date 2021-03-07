import { Timer } from '@teambit/legacy/dist/toolbox/timer';
import { Command } from '@teambit/cli';
import { ComponentFactory } from '@teambit/component';
import { Logger } from '@teambit/logger';
import { LinterMain } from './linter.main.runtime';

export class LintCmd implements Command {
  name = 'lint';
  description = 'lint subset of components in your workspace.';
  group = 'component';
  options = [];

  constructor(private linter: LinterMain, private componentHost: ComponentFactory, private logger: Logger) {}

  async report() {
    const timer = Timer.create();
    timer.start();

    const components = await this.componentHost.list();
    const linterResults = await this.linter.lint(components);
    this.logger.consoleTitle(`linting total of ${components.length} in workspace '${this.componentHost.name}'`);

    linterResults.results.forEach((result) => {
      result.data?.results.forEach((lintRes) => {
        this.logger.consoleTitle(`${lintRes.component.id.toString({ ignoreVersion: true })}`);
        this.logger.console(lintRes.output);
      });
    });

    const { seconds } = timer.stop();
    return `linted ${components.length} components in ${seconds}.`;
  }
}
