// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, { useState, useEffect } from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Box, Color } from 'ink';
import { Command, CLIArgs } from '../paper';
import { Workspace } from '../workspace';
import { ReleasesExtension } from './releases.extension';

export class ReleaserCmd implements Command {
  name = 'run-new [pattern]';
  description = 'run set of tasks for release';
  alias = '';
  group = '';
  shortDescription = '';
  options = [];

  constructor(private releaser: ReleasesExtension, private workspace: Workspace) {}

  async render([userPattern]: CLIArgs) {
    const pattern = userPattern && userPattern.toString();
    const results = await this.releaser.release(pattern ? await this.workspace.byPattern(pattern) : undefined);
    // @todo: decide about the output
    results.forEach((
      result // eslint-disable-next-line no-console
    ) => console.log('result', `Env: ${result.env}\nResult: ${JSON.stringify(result.res, undefined, 2)}`));
    return <Color cyan>compiled {results.length} components successfully</Color>;
  }
}
