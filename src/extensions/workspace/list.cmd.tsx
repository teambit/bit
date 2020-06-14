// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Color } from 'ink';
import { Command } from '../cli';
import Workspace from './workspace';

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
    return <Color green>hi there</Color>;
  }
}
