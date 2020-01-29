import React from 'react';
import { Color } from 'ink';
import { Command } from '../paper';
import { CLIArgs } from '../paper/command';
import { Workspace } from '../workspace';

export class CompileCmd implements Command {
  name = 'compile [id]';
  description = '';
  shortDescription = '';
  alias = '';
  group = '';
  options = [];

  constructor(
    private workspace: Workspace
  ) {}

  async render([id]: CLIArgs) {
    // const component = await this.workspace.get(id as string);
    // const capsule = await component.isolate();
    
    
    return <Color green>dadsad</Color>;
  }
}
