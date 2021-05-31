import { Timer } from '@teambit/legacy/dist/toolbox/timer';
import { Command, CommandOptions } from '@teambit/cli';
import { ComponentFactory, ComponentID } from '@teambit/component';
import { Logger } from '@teambit/logger';
import { Workspace } from '@teambit/workspace';
import { LinterMain } from './linter.main.runtime';

export type LinterOptions = {
  changed?: boolean;
};

export class LintCmd implements Command {
  name = 'lint [component...]';
  description = 'lint components in the development workspace';
  group = 'development';
  options = [['c', 'changed', 'lint only new and modified components']] as CommandOptions;

  constructor(
    private linter: LinterMain,
    private componentHost: ComponentFactory,
    private logger: Logger,
    private workspace: Workspace
  ) {}

  async report([components]: [string[]], linterOptions: LinterOptions) {
    const timer = Timer.create();
    timer.start();

    const componentsIds = await this.getIdsToLint(components, linterOptions.changed);
    const componentsToLint = await this.workspace.getMany(componentsIds);
    const linterResults = await this.linter.lint(componentsToLint);
    this.logger.consoleTitle(`linting total of ${componentsToLint.length} in workspace '${this.componentHost.name}'`);

    linterResults.results.forEach((result) => {
      result.data?.results.forEach((lintRes) => {
        this.logger.consoleTitle(`${lintRes.component.id.toString({ ignoreVersion: true })}`);
        this.logger.console(lintRes.output);
      });
    });

    const { seconds } = timer.stop();
    return `linted ${componentsToLint.length} components in ${seconds}.`;
  }

  private async getIdsToLint(components: string[], changed = false): Promise<ComponentID[]> {
    if (components.length) {
      return this.workspace.resolveMultipleComponentIds(components);
    }
    if (changed) {
      return this.workspace.getNewAndModifiedIds();
    }
    return this.componentHost.listIds();
  }
}
