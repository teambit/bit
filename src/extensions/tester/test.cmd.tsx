// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, { useState, useEffect } from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Box, Color } from 'ink';
import { Command } from '../cli';
import { TesterExtension } from './tester.extension';
import { Workspace } from '../workspace';

const chalk = require('chalk');

export class TestCmd implements Command {
  // TODO: @david please call legacy tester in case of legacy workspace.
  name = 'test [pattern]';
  description = 'test set of components in your workspace';
  alias = 'at';
  private = true;
  group = 'development';
  shortDescription = '';
  options = [];

  constructor(private tester: TesterExtension, private workspace: Workspace) {}

  async render([userPattern]: [string]) {
    const pattern = userPattern && userPattern.toString();
    const components = pattern ? await this.workspace.byPattern(pattern) : await this.workspace.list();

    // TODO: @david please add logger here instead.
    // eslint-disable-next-line no-console
    console.log(`testing ${components.length} components in workspace '${chalk.cyan(this.workspace.name)}'`);
    const envs = await this.tester.test(components);

    return (
      <Box>
        {envs.map((env, key) => {
          return <Env key={key} env={env.env} results={env.res} />;
        })}
      </Box>
    );
  }
}

function Env({ env }: any) {
  return <Color cyan>{env}</Color>;
}
