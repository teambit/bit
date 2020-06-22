// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, { useState, useEffect } from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Box, Color } from 'ink';
import { Command } from '../cli';
import { Workspace } from '../workspace';
import { BuilderExtension } from './builder.extension';

export class BuilderCmd implements Command {
  name = 'run-new [pattern]';
  description = 'run set of tasks for build';
  alias = '';
  group = '';
  private = true;
  shortDescription = '';
  options = [];

  constructor(private builder: BuilderExtension, private workspace: Workspace) {}

  async render([userPattern]: [string]) {
    const pattern = userPattern && userPattern.toString();
    const results = await this.builder.build(
      pattern ? await this.workspace.byPattern(pattern) : await this.workspace.list()
    );
    // @todo: decide about the output
    results.forEach((
      result // eslint-disable-next-line no-console
    ) => console.log('result', `Env: ${result.env}\nResult: ${JSON.stringify(result.res, undefined, 2)}`));
    return <Color cyan>compiled {results.length} components successfully</Color>;
  }
}
