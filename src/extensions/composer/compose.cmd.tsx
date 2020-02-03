import React from 'react';
import { start } from '@teambit/composer';
import { Color } from 'ink';
import { Command, CLIArgs } from '../paper';
import { Workspace } from '../workspace';
import { Build } from '../build';
import { Flags } from '../paper/command';

export default class ComposeCmd implements Command {
  name = 'start [id]';
  description = 'start a dev environment for a workspace or a specific component'
  alias = 'c';
  group = 'development'
  shortDescription = ''
  options = []

  constructor(
    private workspace: Workspace,
    private build: Build
  ) {}

  // TODO: remove this ts-ignore
  // @ts-ignore
  async render() {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async () => {
      const components = await this.workspace.list();
      const resolved = await this.build.run('build', components);

      const data = resolved.reduce((map, component) => {
        map[component.component.id.toString()] = component.capsule.wrkDir;
        return map;
      }, {});

      // eslint-disable-next-line no-console
      start(data);

      return <Color green>das</Color>
    });
  }
}
