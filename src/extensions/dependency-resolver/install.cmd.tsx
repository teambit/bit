// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Color } from 'ink';
import { Command } from '../cli';
import { DependencyResolverExtension } from './dependency-resolver.extension';

export default class InstallCmd implements Command {
  name = 'install';
  description = 'install all component dependencies';
  alias = 'in';
  group = 'development';
  shortDescription = '';
  options = [];

  constructor(private dependencyResolver: DependencyResolverExtension) {}

  // TODO: remove this ts-ignore
  // @ts-ignore
  async render() {
    try {
      const results = await this.dependencyResolver.workspaceInstall();
      return <Color green>Successfully installed {results.length} component(s)</Color>;
    } catch (e) {
      return <Color red>Failed to install: {e.message || e.toString()}</Color>;
      // TODO: exit status?
    }
  }
}
