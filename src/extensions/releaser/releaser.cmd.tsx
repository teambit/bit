// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, { useState, useEffect } from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Box, Color } from 'ink';
import { Command, CLIArgs } from '../paper';
import { Workspace } from '../workspace';
import { Releaser } from './releaser';

export class ReleaserCmd implements Command {
  name = 'run-new [pattern]';
  description = 'run set of tasks for release';
  alias = '';
  group = '';
  shortDescription = '';
  options = [];

  constructor(private releaser: Releaser, private workspace: Workspace) {}

  async render([userPattern]: CLIArgs) {
    const pattern = userPattern && userPattern.toString();
    const results = await this.releaser.release(pattern ? await this.workspace.byPattern(pattern) : undefined);
    // @todo: decide about the output
    // eslint-disable-next-line no-console
    console.log('ReleaserCmd -> render -> results', results);
    return <Color cyan>compiled {results.length} components successfully</Color>;
  }
}
