// :TODO make sure React is not an unused variable
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
import { Scripts } from './scripts';
import {Command, CLIArgs} from '../cli'
import { Flags, PaperOptions } from '../paper/command';

export class RunCmd implements Command {
  name = 'run <pipeline> [component...]';
  description = 'increamantaly build any set of components with a configured build pipeline as defined in the component configuration. (builds new and modified components by default)';
  shortDescription = '';
  alias = '';
  group = '';

  // @ts-ignore
  options:PaperOptions = [
    ['p', 'parallelism', 'specify the number of concurrent build processes for Bit to run. default value depends on the operating system and the number of available CPU cores.']
  ];

  constructor(
    private scripts: Scripts
  ) {}

  // json([id]: CLIArgs) {

  // }

  async render([pipeline, components]: CLIArgs, { parallelism }: Flags) {
    const parallelismN = (parallelism && typeof parallelism === 'string') ? Number.parseInt(parallelism) : 5;
    const actualComps = typeof components === 'string' ? [components]: components
    await this.scripts.run(pipeline as string, actualComps, { concurrency: parallelismN});

    return <div />;
  }
}
