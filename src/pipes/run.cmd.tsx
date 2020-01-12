import React from 'react';
import { Color } from 'ink';
// import { Run } from './run.component';
// import { Command } from '../paper';

export default class RunCmd {
  name = 'run <pipe>';
  description = `executes a pipe of extensions on any set of components.`;
  alias = 'r';

  opts = [
    ['j', 'json', 'return a json version of the component']
  ];

  render() {
    return <Color>my first extension!!!</Color>;
  }

  json() {
    return {
      
    };
  }
}
