// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Color } from 'ink';
import { Command, CLIArgs } from '../paper';
import { Workspace } from '../workspace';
import { Flows } from '../flows';

export default class ComposeCmd implements Command {
  name = 'start [id]';
  description = 'start a dev environment for a workspace or a specific component';
  alias = 'c';
  group = 'development';
  shortDescription = '';
  options = [];

  constructor(private workspace: Workspace, private flows: Flows) {}

  // TODO: remove this ts-ignore
  // @ts-ignore
  async render([id]: CLIArgs) {
    // eslint-disable-line @typescript-eslint/no-unused-vars
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async () => {
      // @ts-ignore
      // const components = id ? await this.workspace.get(id) : await this.workspace.list();
      // const components = await this.workspace.get('base/card');
      // const resolved = await this.flows.run(components, 'build');

      // const data = resolved.reduce((map, component) => {
      //   map[component.component.id.toString()] = component.capsule.wrkDir;
      //   return map;
      // }, {});

      // eslint-disable-next-line no-console
      // start(data);

      return <Color green>das</Color>;
    });
  }
}
