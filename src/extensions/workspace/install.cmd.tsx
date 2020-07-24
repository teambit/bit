import { Command } from '../cli';
import Workspace from './workspace';
import { ComponentID } from '../component';

export default class InstallCmd implements Command {
  name = 'install [id...]';
  description = 'install all component dependencies';
  alias = 'in';
  group = 'component';
  shortDescription = '';
  options = [];

  constructor(private workspace: Workspace) {}

  async report([rawIds]: [string[]]) {
    const ids = rawIds.map((rawId) => this.workspace.resolveComponentId(rawId));
    const results = await this.workspace.install(ids);
    console.log(results);
    return `Successfully installed ${results} component(s)`;
  }
}
