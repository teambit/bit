import { Command, CommandOptions } from '@teambit/cli';
import { IsolatorMain } from '@teambit/isolator';
import chalk from 'chalk';

import { Workspace } from './workspace';

export class CapsuleListCmd implements Command {
  name = 'capsule-list';
  description = `list all capsules`;
  shortDescription = 'list all capsules';
  group = 'capsules';
  private = true;
  alias = '';
  options = [['j', 'json', 'json format']] as CommandOptions;

  constructor(private isolator: IsolatorMain, private workspace: Workspace) {}

  async report() {
    const list = await this.isolator.list(this.workspace.path);
    const workspaceRootDir = this.isolator.getCapsulesRootDir(this.workspace.path);
    const scopeRootDir = this.isolator.getCapsulesRootDir(this.workspace.scope.path);
    // TODO: improve output
    return chalk.green(`found ${list.capsules.length} capsule(s) for workspace ${list.workspace}.
workspace capsules root-dir: ${workspaceRootDir}
scope capsules root-dir: ${scopeRootDir}
use --json to get the list of all workspace capsules`);
  }

  async json() {
    const list = await this.isolator.list(this.workspace.path);
    return list;
  }
}
