import React from 'react';
import { Color, Text, Box } from 'ink';
import { Command, CLIArgs } from '../cli';
import { Create } from './create';

export class CreateCmd implements Command {
  name = 'create [name]';
  description = 'create a new component from a template';
  shortDescription = '';
  alias = '';
  group = '';

  // @ts-ignore
  options = [];

  constructor(private create: Create) {}

  async render([name]: CLIArgs) {
    // @ts-ignore
    const results = await this.create.create(name);
    const result = results.addedComponents[0];
    // eslint-disable-next-line no-console
    // console.log('results', result);
    return <Box>{JSON.stringify(result, null, 4)}</Box>;
  }
}
