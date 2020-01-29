import React from 'react';
import { start } from '@teambit/composer';
import { Color, AppContext } from 'ink';
import { Command } from '../paper';
import { Workspace } from '../workspace';
import { Capsule } from '../capsule';
import { CLIArgs } from '../paper/command';

export default class ComposeCmd implements Command {
  name = 'compose [id]';
  description = 'start a dev environment for a workspace or a specific component'
  alias = 'c';
  group = 'development'
  shortDescription = ''
  options = []

  constructor(
    private workspace: Workspace,
    private capsule: Capsule
  ) {}

  async render([id]: CLIArgs) {
    const components = await this.workspace.list();
    const capsules = await this.capsule.create(components);

    start(Object.keys(capsules).reduce((map: {[name: string]: string}, componentId: string) => {
      map[componentId] = capsules[componentId].wrkDir;
      return map;
    }, {}));

    return (
    <AppContext.Consumer>
      {({ exit }) => <Color green></Color>}
    </AppContext.Consumer>)
  }
}
