// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Command } from '@teambit/cli';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Box, Text } from 'ink';
import React from 'react';

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
        <Text color="green">{item.relativePath}</Text>
      </li>
    ));

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const AddedComponent = () => (
      <Box padding={1} flexDirection="column">
        <Box>
          <Text>
            tracking component <Text bold>{result.id}</Text>
          </Text>
        </Box>
        <Box paddingLeft={2}>
          <ul>{files}</ul>
        </Box>
      </Box>
    );

    return <AddedComponent />;
  }
}
