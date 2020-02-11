import React from 'react';
import { Color } from 'ink';
import { Command } from '../paper';
import { Workspace } from '../workspace';

export default class InstallCmd implements Command {
  name = 'install';
  description = 'install all component dependencies'
  alias = 'in';
  group = 'development'
  shortDescription = ''
  options = []

  constructor(
    private workspace: Workspace,
  ) {}

  // TODO: remove this ts-ignore
  // @ts-ignore
  async render() {
    try {
      const components = await this.workspace.list();
      const isolatedEnvs = await this.workspace.load(components.map(c => c.id.toString()));
      return <Color green>Successfully installed {isolatedEnvs.length} components</Color>
    } catch (e) {
      return <Color red>Failed to install: {e.message}</Color>
    }
  }
}
