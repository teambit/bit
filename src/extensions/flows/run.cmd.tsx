/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { Flows } from './flows';
import { Command, CLIArgs } from '../cli';
import { Flags } from '../paper/command';

export class RunCmd implements Command {
  name = 'run';
  shortDescription = 'Run user flows on a network of dependent component';

  constructor(private flows: Flows) {}

  async render(_args: CLIArgs, _flags: Flags) {
    return Promise.resolve(<div></div>);
  }
}
