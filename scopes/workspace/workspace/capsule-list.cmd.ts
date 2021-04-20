import { Command, CommandOptions } from '@teambit/cli';
import { IsolatorMain } from '@teambit/isolator';
import chalk from 'chalk';

import { Workspace } from './workspace';

export class CapsuleListCmd implements Command {
  name = 'capsule-list';
  description = `list all capsules`;
  shortDescription = 'list all capsules';
  group = 'capsules';
  alias = '';
  options = [['j', 'json', 'json format']] as CommandOptions;

  constructor(private isolator: IsolatorMain, private workspace: Workspace) {}

  async report() {
    const list = await this.isolator.list(this.workspace.path);
    const workspaceRootDir = this.isolator.getCapsulesRootDir(this.workspace.path);
    const scopeRootDir = this.isolator.getCapsulesRootDir(this.workspace.scope.path);
    const scopeAspectsRootDir = this.isolator.getCapsulesRootDir(this.workspace.scope.getAspectCapsulePath());
    // TODO: improve output
    return chalk.green(`found ${chalk.cyan(list.capsules.length.toString())} capsule(s) for workspace:  ${chalk.cyan(
      list.workspace
    )}
workspace capsules root-dir:       ${chalk.cyan(workspaceRootDir)}
scope capsules root-dir:           ${chalk.cyan(scopeRootDir)}
scope's aspects capsules root-dir: ${chalk.cyan(scopeAspectsRootDir)}
use --json to get the list of all workspace capsules`);
  }

  async json() {
    const list = await this.isolator.list(this.workspace.path);
    return list;
  }
}
