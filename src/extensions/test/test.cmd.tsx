/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { Color, AppContext } from 'ink';
import { Command, CLIArgs } from '../cli';
import { Flags, PaperOptions } from '../paper/command';
import { Test } from './test';
import { paintAllSpecsResults, paintSummarySpecsResults } from '../../cli/chalk-box';

export class TestCmd implements Command {
  name = 'run-test [component...]'; // @todo: choose a name. "test" is taken.
  description = 'test components';
  shortDescription = '';
  alias = '';
  group = '';
  options = [
    ['a', 'all', 'test all components in your workspace, including unmodified components'],
    ['v', 'verbose', 'showing npm verbose output for inspection and prints stack trace'],
    ['j', 'json', 'return results in json format']
  ] as PaperOptions;

  constructor(private test: Test) {}

  async render([components]: CLIArgs, { all = false, verbose = false }: { all?: boolean; verbose?: boolean }) {
    // @ts-ignore
    const results = await this.test.test(components, { all, verbose });

    const testResults = {
      type: 'results',
      results
    };
    let output;
    const specsResultsWithComponentId = testResults.results;
    if (specsResultsWithComponentId && Array.isArray(specsResultsWithComponentId)) {
      // @ts-ignore
      output = paintAllSpecsResults(testResults, verbose) + paintSummarySpecsResults(specsResultsWithComponentId);
    } else {
      output = "couldn't get test results...";
    }

    return (
      <AppContext.Consumer>
        {({ exit }) => {
          setTimeout(() => {
            exit(); // @todo: fix the code once test is ready.
          }, 0);

          return <Color>{output}</Color>;
        }}
      </AppContext.Consumer>
    );
  }

  async json([components]: CLIArgs, { all, verbose }: Flags) {
    // @ts-ignore
    const testResults = await this.test.test(components, { all, verbose });
    return {
      data: testResults,
      // @todo: fix the code once test is ready.
      code: 0
    };
  }
}
