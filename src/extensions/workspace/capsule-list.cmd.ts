import chalk from 'chalk';
import { Command, CommandOptions } from '../cli';
import { IsolatorExtension } from '../isolator/isolator.extension';
import { Workspace } from './workspace';

export class CapsuleListCmd implements Command {
  name = 'capsule-list';
  description = `list all capsules`;
  shortDescription = 'list all capsules';
  group = 'capsules';
  private = true;
  alias = '';
  options = [['j', 'json', 'json format']] as CommandOptions;

  constructor(private isolator: IsolatorExtension, private workspace: Workspace) {}

  async report() {
    const list = await this.isolator.list(this.workspace.path);
    const rootDir = this.isolator.getCapsulesRootDir(this.workspace.path);
    // TODO: improve output
    return chalk.green(`found ${list.capsules.length} capsule(s) for workspace ${list.workspace}.
capsules root-dir: ${rootDir}
use --json to get the list of all capsules`);
  }

  async json() {
    const list = await this.isolator.list(this.workspace.path);
    return list;
  }
}
