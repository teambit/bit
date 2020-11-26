import { Command, CommandOptions, Flags } from '@teambit/cli';
import { Logger } from '@teambit/logger';
import { Workspace } from '@teambit/workspace';
import { ConsumerNotFound } from 'bit-bin/dist/consumer/exceptions';
import { Timer } from 'bit-bin/dist/toolbox/timer';
import { Box, Text } from 'ink';
import React from 'react';

import type { TesterMain } from './tester.main.runtime';

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
    ['e', 'env <id>', 'test only the given env'],
    // TODO: we need to reduce this redundant casting every time.
  ] as CommandOptions;

  constructor(private tester: TesterMain, private workspace: Workspace, private logger: Logger) {}

  async render([userPattern]: [string], { watch, debug, env }: Flags) {
    this.logger.off();
    const timer = Timer.create();
    timer.start();
    if (!this.workspace) throw new ConsumerNotFound();
    const pattern = userPattern && userPattern.toString();
    const components = pattern ? await this.workspace.byPattern(pattern) : await this.workspace.list();

    this.logger.console(
      `testing total of ${components.length} components in workspace '${chalk.cyan(this.workspace.name)}'`
    );

    if (watch) {
      await this.tester.watch(components, {
        watch: Boolean(watch),
        debug: Boolean(debug),
        env: env as string | undefined,
      });
    } else {
      await this.tester.test(components, {
        watch: Boolean(watch),
        debug: Boolean(debug),
        env: env as string | undefined,
      });
    }
    const { seconds } = timer.stop();

    if (watch) return <Box></Box>;
    return (
      <Box>
        <Text>tested </Text>
        <Text color="cyan">{components.length} </Text>
        <Text>components in </Text>
        <Text color="cyan">{seconds} </Text>
        <Text>seconds.</Text>
      </Box>
    );
  }
}
