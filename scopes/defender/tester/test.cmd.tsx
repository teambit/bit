import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { Logger } from '@teambit/logger';
import { Workspace } from '@teambit/workspace';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import { Timer } from '@teambit/legacy/dist/toolbox/timer';
import { Box, Text } from 'ink';
import React from 'react';
import { NoMatchingComponents } from './exceptions';

import type { TesterMain } from './tester.main.runtime';

type TestFlags = {
  watch: boolean;
  debug: boolean;
  all: boolean;
  env?: string;
  scope?: string;
  junit?: string;
  coverage?: boolean;
};

export class TestCmd implements Command {
  name = 'test [component-pattern]';
  description = 'Tests components in your workspace';
  arguments = [
    {
      name: 'component-pattern',
      description:
        'the components to test (defaults to all components). use component name, component id, or component pattern. use component pattern to select multiple components. \nuse comma to separate patterns and "!" to exclude. e.g. "ui/**, !ui/button"\nwrap the pattern with quotes',
    },
  ];
  alias = 'at';
  group = 'development';
  options = [
    ['w', 'watch', 'start the tester in watch mode.'],
    ['d', 'debug', 'start the tester in debug mode.'],
    ['a', 'all', 'test all components, not only new and modified'],
    ['', 'junit <filepath>', 'write tests results as JUnit XML format into the specified file path'],
    ['', 'coverage', 'show code coverage data'],
    ['e', 'env <id>', 'test only the given env'],
    ['s', 'scope <scope-name>', 'name of the scope to test'],
    // TODO: we need to reduce this redundant casting every time.
  ] as CommandOptions;

  constructor(private tester: TesterMain, private workspace: Workspace, private logger: Logger) {}

  async render(
    [userPattern]: [string],
    { watch = false, debug = false, all = false, env, scope, junit, coverage = false }: TestFlags
  ) {
    const timer = Timer.create();
    const scopeName = typeof scope === 'string' ? scope : undefined;
    timer.start();
    if (!this.workspace) throw new ConsumerNotFound();

    const getPatternWithScope = () => {
      if (!userPattern && !scope) return undefined;
      const pattern = userPattern || '**';
      return scopeName ? `${scopeName}/${pattern}` : pattern;
    };
    const patternWithScope = getPatternWithScope();
    const components = await this.workspace.getComponentsByUserInput(all, patternWithScope, true);
    if (!components.length) {
      if (userPattern) throw new NoMatchingComponents(userPattern);
      return {
        code: 0,
        data: (
          <Box>
            <Text bold>
              no components found to test. use "--all" flag to test all components or specify the ids to test,
              otherwise, only new and modified components will be tested{' '}
            </Text>
          </Box>
        ),
      };
    }

    this.logger.console(
      `testing total of ${components.length} components in workspace '${chalk.cyan(this.workspace.name)}'`
    );

    let code = 0;
    if (watch && !debug) {
      // avoid turning off the logger for non-watch scenario. otherwise, when this aspect throws errors, they'll be
      // swallowed. (Jest errors are shown regardless via Jest, but if the tester is unable to run Jest in the first
      // place, these errors won't be shown)
      this.logger.off();
      await this.tester.watch(components, {
        watch,
        debug,
        env,
        coverage,
      });
    } else {
      const tests = await this.tester.test(components, {
        watch,
        debug,
        env,
        junit,
        coverage,
      });
      if (tests.hasErrors()) code = 1;
    }
    const { seconds } = timer.stop();

    if (watch) return <Box></Box>;
    return {
      code,
      data: (
        <Box>
          <Text>test has been completed in </Text>
          <Text color="cyan">{seconds} </Text>
          <Text>seconds.</Text>
        </Box>
      ),
    };
  }
}
