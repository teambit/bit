// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Command } from '@teambit/cli';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Text } from 'ink';
import React from 'react';

import { Workspace } from './workspace';

export class ListCmd implements Command {
  constructor(private workspace: Workspace) {}

  name = 'lister';

  description = 'list all components in the workspace';

  summery = 'a different text i dont really need';

  group = 'workspace';

  alias = '';

  options = [];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async render(params: any, options: { [key: string]: any }) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const list = await this.workspace.list();
    return <Text color="green">hi there</Text>;
  }
}
