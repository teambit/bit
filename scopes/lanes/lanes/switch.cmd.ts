import chalk from 'chalk';
import { compact } from 'lodash';
import { applyVersionReport, installationErrorOutput, MergeStrategy, compilationErrorOutput } from '@teambit/merging';
import { Command, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
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
    ['', 'force-ours', 'do not merge, preserve local files as is'],
    ['', 'force-theirs', 'do not merge, just overwrite with incoming files'],
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
    ['', 'verbose', 'display detailed information about components that legitimately were not switched'],
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
      forceOurs,
      forceTheirs,
      getAll = false,
      workspaceOnly = false,
      skipDependencyInstallation = false,
      pattern,
      verbose,
      json = false,
    }: {
      head?: boolean;
      alias?: string;
      autoMergeResolve?: MergeStrategy;
      forceOurs?: boolean;
      forceTheirs?: boolean;
      getAll?: boolean;
      workspaceOnly?: boolean;
      skipDependencyInstallation?: boolean;
      override?: boolean;
      pattern?: string;
      verbose?: boolean;
      json?: boolean;
    }
  ) {
    const { components, failedComponents, installationError, compilationError } = await this.lanes.switchLanes(lane, {
      head,
      alias,
      merge: autoMergeResolve,
      forceOurs,
      forceTheirs,
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
      const title = '\nswitch skipped for the following component(s)';
      const body = compact(
        failedComponents.map((failedComponent) => {
          // all failures here are "unchangedLegitimately". otherwise, it would have been thrown as an error
          if (!verbose) return null;
          return `${chalk.bold(failedComponent.id.toString())} - ${chalk.white(failedComponent.unchangedMessage)}`;
        })
      ).join('\n');
      if (!body) {
        return `${chalk.bold(`\nswitch skipped legitimately for ${failedComponents.length} component(s)`)}
  (use --verbose to list them next time)`;
      }
      return `${chalk.underline(title)}\n${body}`;
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
