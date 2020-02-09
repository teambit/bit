import React from 'react';
import { Color } from 'ink';
import { Workspace } from '../workspace';
import { Pipes } from './pipes';
import {Command, CLIArgs} from '../cli'
import { Flags } from '../paper/command';

export class RunCmd implements Command {
  name = 'run <pipeline> [component...]';
  description = 'increamantaly build any set of components with a configured build pipeline as defined in the component configuration. (builds new and modified components by default)';
  shortDescription = '';
  alias = '';
  group = '';

  // @ts-ignore
  options = [
    ['p', 'parallelism', 'specify the number of concurrent build processes for Bit to run. default value depends on the operating system and the number of available CPU cores.']
  ];

  constructor(
    private pipes: Pipes
  ) {}

  // json([id]: CLIArgs) {

  // }

  async render([pipeline, components]: CLIArgs, { parallelism }: Flags) {
    const parallelismN = (parallelism && typeof parallelism === 'string') ? Number.parseInt(parallelism) : 5;
    const actualComps = typeof components === 'string' ? [components]: components
    await this.pipes.run(pipeline as string, actualComps, { parallelism: parallelismN, topologicalSort: true });

    return <Color green>application</Color>;
  }
}
