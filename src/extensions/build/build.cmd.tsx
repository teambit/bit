import React from 'react';
import { Color } from 'ink';
import { Command } from '../paper';
import { CLIArgs } from '../paper/command';
import { Workspace } from '../workspace';
import { Build } from './build';

export class RunCmd implements Command {
  name = 'run <pipeline> [...component]';
  description = 'increamantaly build any set of components with a configured build pipeline as defined in the component configuration. (builds new and modified components by default)';
  shortDescription = '';
  alias = '';
  group = '';

  // @ts-ignore
  options = [
    ['p', 'parallelism', 'specify the number of concurrent build processes for Bit to run. default value depends on the operating system and the number of available CPU cores.']
  ];

  constructor(
    private build: Build
  ) {}

  // json([id]: CLIArgs) {

  // }

  async render([pipeline, components]: CLIArgs, { parallelism }) {
    await this.build.run(pipeline as string, components as any[], parallelism);
    
    return <Color green>application</Color>;
  }
}
