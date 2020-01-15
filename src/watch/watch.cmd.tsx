import React from 'react';
import { Color } from 'ink';
import { Command } from '../paper';

export default class ServeCommand implements Command {
  name = 'watch [id...]';
  description = 'watch a set of components';
  alias = '';

  options = []

  async render() {
    return <Color>hi amit</Color>
  }
}
