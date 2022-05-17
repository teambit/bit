import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { MergeStrategy, applyVersionReport } from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import { LanesMain } from './lanes.main.runtime';

export class SwitchCmd implements Command {
  name = 'switch <lane>';
  description = `switch to the specified lane`;
  private = true;
  alias = '';
  options = [
    [
      'n',
      'alias <string>',
      'relevant when the specified lane is a remote late. name a local lane differently than the remote lane',
    ],
    [
      'm',
      'merge [strategy]',
      'merge local changes with the checked out version. strategy should be "theirs", "ours" or "manual"',
    ],
    ['a', 'get-all', 'checkout all components in a lane include ones that do not exist in the workspace'],
    ['', 'skip-dependency-installation', 'do not install packages of the imported components'],
    ['j', 'json', 'return the output as JSON'],
  ] as CommandOptions;
  loader = true;

  constructor(private lanes: LanesMain) {}

  async report(
    [lane]: [string],
    {
      alias,
      merge,
      getAll = false,
      skipDependencyInstallation = false,
      json = false,
    }: {
      alias?: string;
      merge?: MergeStrategy;
      getAll?: boolean;
      skipDependencyInstallation?: boolean;
      override?: boolean;
      json?: boolean;
    }
  ) {
    const { components, failedComponents } = await this.lanes.switchLanes(lane, {
      alias,
      merge,
      getAll,
      skipDependencyInstallation,
    });
    if (json) {
      return JSON.stringify({ components, failedComponents }, null, 4);
    }
    const getFailureOutput = () => {
      if (!failedComponents || !failedComponents.length) return '';
      const title = 'the switch has been canceled on the following component(s)';
      const body = failedComponents
        .map(
          (failedComponent) =>
            `${chalk.bold(failedComponent.id.toString())} - ${chalk.red(failedComponent.failureMessage)}`
        )
        .join('\n');
      return `${title}\n${body}\n\n`;
    };
    const getSuccessfulOutput = () => {
      const laneSwitched = chalk.green(`\nsuccessfully set "${chalk.bold(lane)}" as the active lane`);
      if (!components || !components.length) return `No component had been changed.${laneSwitched}`;
      if (components.length === 1) {
        const component = components[0];
        const componentName = component.id.toStringWithoutVersion();
        const title = `successfully switched ${chalk.bold(componentName)} to version ${chalk.bold(
          component.id.version as string
        )}\n`;
        return `${title} ${applyVersionReport(components, false)}${laneSwitched}`;
      }
      const title = `successfully switched the following components to the version of ${lane}\n\n`;
      const componentsStr = applyVersionReport(components, true, false);
      return title + componentsStr + laneSwitched;
    };
    const failedOutput = getFailureOutput();
    const successOutput = getSuccessfulOutput();
    return failedOutput + successOutput;
  }
}
