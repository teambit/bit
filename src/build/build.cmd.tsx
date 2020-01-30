import React from 'react';
import { Color } from 'ink';
import { Command } from '../paper';
import { CLIArgs } from '../paper/command';
import { Workspace } from '../workspace';
import { Build } from './build';

export class BuildCmd implements Command {
  name = 'rebuild [id]';
  description = '';
  shortDescription = '';
  alias = '';
  group = '';
  options = [];

  constructor(
    private workspace: Workspace,
    private build: Build
  ) {}

  async render([id]: CLIArgs) {
    // const component = await this.workspace.get(id as string);
    // const capsule = await component.isolate();
    
    
    return <Color green>application</Color>;
  }
}
