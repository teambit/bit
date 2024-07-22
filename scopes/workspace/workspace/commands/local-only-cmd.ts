/* eslint max-classes-per-file: 0 */
import chalk from 'chalk';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy/dist/constants';
import { Command, CommandOptions } from '@teambit/cli';
import { Workspace } from '../workspace';

export class LocalOnlySetCmd implements Command {
  name = 'set <component-pattern>';
  description = 'set a component as local-only';
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  alias = '';
  options = [] as CommandOptions;

  constructor(private workspace: Workspace) {}

  async report([pattern]: [string]) {
    const ids = await this.workspace.idsByPattern(pattern);
    await this.workspace.setLocalOnly(ids);
    const title = chalk.bold(`successfully set the following components as local-only`);
    return `${title}:\n${ids.map((id) => id.toString()).join('\n')}`;
  }
}

export class LocalOnlyUnsetCmd implements Command {
  name = 'unset <component-pattern>';
  description = 'remove a component from local-only';
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  alias = '';
  options = [] as CommandOptions;

  constructor(private workspace: Workspace) {}

  async report([pattern]: [string]) {
    const ids = await this.workspace.idsByPattern(pattern);
    const successfullyUnset = await this.workspace.unsetLocalOnly(ids);
    if (successfullyUnset.length === 0) {
      return chalk.yellow('no local-only components were found');
    }
    const title = chalk.bold(`successfully unset the following component(s)`);
    return `${title}:\n${successfullyUnset.map((id) => id.toString()).join('\n')}`;
  }
}

export class LocalOnlyListCmd implements Command {
  name = 'list';
  description = 'list all local-only components';
  alias = '';
  options = [] as CommandOptions;

  constructor(private workspace: Workspace) {}

  async report() {
    const ids = this.workspace.listLocalOnly();
    if (ids.length === 0) {
      return chalk.yellow('no local-only components were found');
    }
    const title = chalk.bold(`the following component(s) are local-only`);
    return `${title}:\n${ids.map((id) => id.toString()).join('\n')}`;
  }
}

export class LocalOnlyCmd implements Command {
  name = 'local-only <sub-command>';
  description = 'manage local-only components, which reside only in the workspace and are not snapped/tagged';
  group = 'development';
  alias = '';
  commands: Command[] = [];
  options = [] as CommandOptions;

  async report([unrecognizedSubcommand]: [string]) {
    return chalk.red(
      `"${unrecognizedSubcommand}" is not a subcommand of "local-only", please run "bit local-only --help" to list the subcommands`
    );
  }
}
