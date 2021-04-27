import { Command, CommandOptions, Flags } from '@teambit/cli';
import { Logger } from '@teambit/logger';
import { Workspace } from '@teambit/workspace';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import { Timer } from '@teambit/legacy/dist/toolbox/timer';
import { Box, Text } from 'ink';
import React from 'react';
import { NoMatchingComponents } from './exceptions';

import type { TesterMain } from './tester.main.runtime';

const chalk = require('chalk');

export class TestCmd implements Command {
  name = 'test [pattern]';
  description = 'test set of components in your workspace';
  alias = 'at';
  group = 'development';
  shortDescription = '';
  options = [
    ['w', 'watch', 'start the tester in watch mode.'],
    ['d', 'debug', 'start the tester in debug mode.'],
    ['e', 'env <id>', 'test only the given env'],
    ['s', 'scope <scope>', 'name of the scope to test'],
    // TODO: we need to reduce this redundant casting every time.
  ] as CommandOptions;

  constructor(private tester: TesterMain, private workspace: Workspace, private logger: Logger) {}

  async render([userPattern]: [string], { watch, debug, env, scope }: Flags) {
    this.logger.off();
    const timer = Timer.create();
    const scopeName = typeof scope === 'string' ? scope : undefined;
    timer.start();
    if (!this.workspace) throw new ConsumerNotFound();
    const pattern = userPattern && userPattern.toString();
    const components =
      pattern || scopeName ? await this.workspace.byPattern(pattern || '*', scopeName) : await this.workspace.list();

    if (!components.length) throw new NoMatchingComponents(pattern);

    this.logger.console(
      `testing total of ${components.length} components in workspace '${chalk.cyan(this.workspace.name)}'`
    );

    let code = 0;
    if (watch && !debug) {
      await this.tester.watch(components, {
        watch: Boolean(watch),
        debug: Boolean(debug),
        env: env as string | undefined,
      });
    } else {
      const tests = await this.tester.test(components, {
        watch: Boolean(watch),
        debug: Boolean(debug),
        env: env as string | undefined,
      });
      tests?.results?.forEach((test) => (test.data?.errors?.length ? (code = 1) : null));
    }
    const { seconds } = timer.stop();

    if (watch) return <Box></Box>;
    return {
      code,
      data: (
        <Box>
          <Text>tested </Text>
          <Text color="cyan">{components.length} </Text>
          <Text>components in </Text>
          <Text color="cyan">{seconds} </Text>
          <Text>seconds.</Text>
        </Box>
      ),
    };
  }
}
