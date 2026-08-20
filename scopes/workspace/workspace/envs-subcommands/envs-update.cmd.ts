import type { Command } from '@teambit/cli';
import { formatTitle, formatItem, formatSuccessSummary, formatHint, joinSections } from '@teambit/cli';
import chalk from 'chalk';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { Workspace } from '../workspace';
import { installAfterEnvChangesMsg } from './envs-set.cmd';

export class EnvsUpdateCmd implements Command {
  name = 'update [env-id] [pattern]';
  description = 'update a version of an env for all components using that env';
  arguments = [
    {
      name: 'env-id',
      description:
        'the environment id (defaults to all envs). optionally, add a version (id@version), if no version is supplied will use the latest version on the remote.',
    },
    {
      name: 'pattern',
      description: `the components to update (defaults to all components). ${COMPONENT_PATTERN_HELP}`,
    },
  ];
  examples = [
    {
      cmd: 'envs update',
      description: 'update all envs for all components in the workspace, to their latest version',
    },
    {
      cmd: "envs update scope.org/env '**/ui/**'",
      description: 'update components in the "ui" namespace that use scope.org/env to use its latest version',
    },
    {
      cmd: 'envs update scope.org/env@2.0.0',
      description: 'update all components that use scope.org/env to version 2.0.0 (of this env).',
    },
  ];
  options = [];
  group = 'component-config';

  constructor(private workspace: Workspace) {}

  async report([aspectId, pattern]: [string, string]) {
    const { updated, alreadyUpToDate } = await this.workspace.updateEnvForComponents(aspectId, pattern);
    if (Object.keys(updated).length) {
      const sections = Object.keys(updated).map((envId) => {
        const items = updated[envId].map((compId) => formatItem(compId.toString()));
        return `${formatTitle(envId)}\n${items.join('\n')}`;
      });
      return joinSections([
        formatSuccessSummary('the following component(s) env has been updated'),
        ...sections,
        installAfterEnvChangesMsg,
      ]);
    }
    if (alreadyUpToDate.length) {
      return formatSuccessSummary(
        `all ${alreadyUpToDate.length} component(s) that use this env are already up to date. nothing to update`
      );
    }
    return formatHint(`unable to find any components using env ${chalk.bold(aspectId)}`);
  }
}
