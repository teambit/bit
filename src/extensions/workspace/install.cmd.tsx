import { Command } from '../cli';
import Workspace from './workspace';

export default class InstallCmd implements Command {
  name = 'install';
  description = 'install all component dependencies';
  alias = 'in';
  group = 'component';
  shortDescription = '';
  options = [];

  constructor(private workspace: Workspace) {}

  async report() {
    const results = await this.workspace.install();
    return `Successfully installed ${results.length} component(s)`;
  }
}
