// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Color, Text, Box } from 'ink';
import { Command } from '../cli';
import { Create } from './create';

export class CreateCmd implements Command {
  name = 'create [name]';
  description = 'create a new component from a template';
  shortDescription = '';
  alias = '';
  group = '';
  private = true;
  options = [];

  constructor(private create: Create) {}

  async render([name]: [string]) {
    // @ts-ignore
    const results = await this.create.create(name);
    const result = results.addedComponents[0];

    const files = result.files.map((item, key) => (
      <li key={key}>
        <Color green>{item.relativePath}</Color>
      </li>
    ));

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const AddedComponent = () => (
      <Box padding={1} flexDirection="column">
        <Box>
          tracking component <Text bold>{result.id}</Text>
        </Box>
        <Box paddingLeft={2}>
          <ul>{files}</ul>
        </Box>
      </Box>
    );

    return <AddedComponent />;
  }
}
