import React from 'react';
import { Color } from 'ink';
import { Command } from '../paper';

export default class ServeCommand implements Command {
  name = 'serve <id>';
  description = 'serve a component';
  alias = '';
  opts = []

  async render() {    
    return <Color>hi amit</Color>
  }
}
