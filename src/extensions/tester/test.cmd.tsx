// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, { useState, useEffect } from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Box, Color } from 'ink';
import { Command } from '../cli';
import { TesterExtension } from './tester.extension';
import { Workspace } from '../workspace';

export class TestCmd implements Command {
  name = 'test-new [pattern]';
  description = 'test set of components in your workspace';
  alias = 'at';
  private = true;
  group = 'development';
  shortDescription = '';
  options = [];

  constructor(private tester: TesterExtension, private workspace: Workspace) {}

  async render([userPattern]: [string]) {
    const pattern = userPattern && userPattern.toString();
    const results = await this.tester.test(
      pattern ? await this.workspace.byPattern(pattern) : await this.workspace.list()
    );

    return <Envs envs={results} />;
  }
}

function Envs({ envs }: any) {
  return (
    <Box>
      {envs.map((env, key) => {
        return <Env key={key} env={env.env} results={env.res} />;
      })}
    </Box>
  );
}

function Env({ env }: any) {
  return <Color cyan>{env}</Color>;
}

// function TestResults() {}
