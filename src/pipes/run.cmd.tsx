import React from 'react';
import { Color } from 'ink';
// import { Run } from './run.component';
import { Command, PaperOptions } from 'paper/command';

export default class RunCmd implements Command {
  name = 'run <pipe>';
  description = `executes a pipe of extensions on any set of components.`;
  alias = 'r';

  opts:PaperOptions = [
    ['j', 'json', 'return a json version of the component']
  ];

  render(opts:PaperOptions) {
    return Promise.resolve(<Color green>my first extension!!!</Color>);
  }

  json() {
    return {

    };
  }
}
