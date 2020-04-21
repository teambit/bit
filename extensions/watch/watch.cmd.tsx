/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { Color } from 'ink';
import { Command } from '@bit/bit.core.paper';

export default class ServeCommand implements Command {
  name = 'watch [id...]';
  description = 'watch a set of components';
  alias = '';
  group = '';
  shortDescription = '';
  options = [];

  async render() {
    return <Color>hi amit</Color>;
  }
}
