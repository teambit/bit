import chalk from 'chalk';
import { compact } from 'lodash';
import { applyVersionReport, installationErrorOutput, compilationErrorOutput } from '@teambit/merging';
import { Command, CommandOptions } from '@teambit/cli';
import { MergeStrategy } from '@teambit/merging';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy/dist/constants';
import { LanesMain } from './lanes.main.runtime';

export class SwitchCmd implements Command {
  name = 'switch <lane>';
  description = `switch to the specified lane`;
  extendedDescription = ``;
  private = true;
  alias = '';
  arguments = [
    {
      name: 'lane',
      description: 'lane-name or lane-id (if lane is not local) to switch to',
    },
  ];
  options = [
    ['h', 'head', 'switch to the head of the lane/main (fetches the latest changes from the remote)'],
    [
      'r',
      'auto-merge-resolve <merge-strategy>',
      'merge local changes with the checked out version. strategy should be "theirs", "ours" or "manual"',
    ],
    ['a', 'get-all', 'DEPRECATED. this is currently the default behavior'],
    ['', 'workspace-only', 'checkout only the components in the workspace to the selected lane'],
    ['x', 'skip-dependency-installation', 'do not install dependencies of the imported components'],
    [
      'p',
      'pattern <component-pattern>',
      `switch only the lane components matching the specified component-pattern. only works when the workspace is empty\n
${COMPONENT_PATTERN_HELP}`,
    ],
    [
      'n',
      'alias <string>',
      "relevant when the specified lane is a remote lane. create a local alias for the lane (doesnt affect the lane's name on the remote",
    ],
    ['j', 'json', 'return the output as JSON'],
  ] as CommandOptions;
  loader = true;

  constructor(private lanes: LanesMain) {}

  async report(
    [lane]: [string],
    {
      head,
      alias,
      autoMergeResolve,
      getAll = false,
      workspaceOnly = false,
      skipDependencyInstallation = false,
      pattern,
      json = false,
    }: {
      head?: boolean;
      alias?: string;
      autoMergeResolve?: MergeStrategy;
      getAll?: boolean;
      workspaceOnly?: boolean;
      skipDependencyInstallation?: boolean;
      override?: boolean;
      pattern?: string;
      json?: boolean;
    }
  ) {
    const { components, failedComponents, installationError, compilationError } = await this.lanes.switchLanes(lane, {
      head,
      alias,
      merge: autoMergeResolve,
      workspaceOnly,
      pattern,
      skipDependencyInstallation,
    });
    if (getAll) {
      this.lanes.logger.warn('the --get-all flag is deprecated and currently the default behavior');
    }
    if (json) {
      return JSON.stringify({ components, failedComponents }, null, 4);
    }
    const getFailureOutput = () => {
      if (!failedComponents || !failedComponents.length) return '';
      const title = 'the switch has been canceled for the following component(s)';
      const body = failedComponents
        .map((failedComponent) => {
          const color = failedComponent.unchangedLegitimately ? 'white' : 'red';
          return `${chalk.bold(failedComponent.id.toString())} - ${chalk[color](failedComponent.unchangedMessage)}`;
        })
        .join('\n');
      return `${title}\n${body}`;
    };
    const getSuccessfulOutput = () => {
      const laneSwitched = chalk.green(`\nsuccessfully set "${chalk.bold(lane)}" as the active lane`);
      if (!components || !components.length) return `No components have been changed.${laneSwitched}`;
      const title = `successfully switched ${components.length} components to the head of lane ${lane}\n`;
      return chalk.bold(title) + applyVersionReport(components, true, false) + laneSwitched;
    };

    return compact([
      getFailureOutput(),
      getSuccessfulOutput(),
      installationErrorOutput(installationError),
      compilationErrorOutput(compilationError),
    ]).join('\n\n');
  }
}
