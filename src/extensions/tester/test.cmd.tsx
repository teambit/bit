import React from 'react';
import { Box, Color } from 'ink';
import { Command, CommandOptions, Flags } from '../cli';
import { TesterExtension } from './tester.extension';
import { Workspace } from '../workspace';
import { ConsumerNotFound } from '../../consumer/exceptions';
import { Timer } from '../../toolbox/timer';

const chalk = require('chalk');

export class TestCmd implements Command {
  name = 'test [pattern]';
  description = 'test set of components in your workspace';
  alias = 'at';
  private = true;
  group = 'development';
  shortDescription = '';
  options = [
    ['w', 'watch', 'start the tester in watch mode.'],
    ['d', 'debug', 'start the tester in debug mode.'],
    // TODO: we need to reduce this redundant casting every time.
  ] as CommandOptions;

  constructor(private tester: TesterExtension, private workspace: Workspace) {}

  async render([userPattern]: [string], { watch, debug }: Flags) {
    const timer = Timer.create();
    timer.start();
    if (!this.workspace) throw new ConsumerNotFound();
    const pattern = userPattern && userPattern.toString();
    const components = pattern ? await this.workspace.byPattern(pattern) : await this.workspace.list();

    // TODO: @david please add logger here instead.
    // eslint-disable-next-line no-console
    console.log(`testing ${components.length} components in workspace '${chalk.cyan(this.workspace.name)}'`);
    await this.tester.test(components, {
      watch: Boolean(watch),
      debug: Boolean(debug),
    });
    const { seconds } = timer.stop();

    return (
      <Box>
        tested <Color cyan>{components.length}</Color> components in <Color cyan>{seconds}</Color> seconds.
      </Box>
    );
  }
}
