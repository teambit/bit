import React from 'react';
// import { start } from '@teambit/composer';
import { Color } from 'ink';
import { Command, CLIArgs } from '../paper';
import { Workspace } from '../workspace';
import { Scripts } from '../scripts';

export default class ComposeCmd implements Command {
  name = 'start [id]';
  description = 'start a dev environment for a workspace or a specific component'
  alias = 'c';
  group = 'development'
  shortDescription = ''
  options = []

  constructor(
    private workspace: Workspace,
    private pipes: Scripts
  ) {}

  // TODO: remove this ts-ignore
  // @ts-ignore
  async render([id]: CLIArgs) {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async () => {
      // @ts-ignore
      const components = id ? await this.workspace.get(id) : await this.workspace.list();
      // const components = await this.workspace.get('base/card');
      const resolved = await this.pipes.run('build', components);

      const data = resolved.reduce((map, component) => {
        map[component.component.id.toString()] = component.capsule.wrkDir;
        return map;
      }, {});

      // eslint-disable-next-line no-console
      // start(data);

      return <Color green>das</Color>
    });
  }
}
