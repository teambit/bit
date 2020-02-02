import React from 'react';
import { start } from '@teambit/composer';
import { Color } from 'ink';
import { Command } from '../paper';
import { Workspace } from '../workspace';
import { Build } from '../build';

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

  async render() {
    // return <Color green>compose start</Color>;
    return new Promise(async (resolve, reject) => {
      const components = await this.workspace.list();
      const resolved = await this.build.run('build', components);
      
      const data = resolved.reduce((map, component) => {
        map[component.component.id.toString()] = component.capsule.wrkDir;
        return map;
      }, {});

      Object.keys(data).forEach(key => console.log(data[key].wrkDir));

      start(data);

      return <Color green>das</Color>
    });
  }
}
