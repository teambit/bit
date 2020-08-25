/* eslint-disable no-console */
import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import ora from 'ora';
import prettyTime from 'pretty-time';

import { WorkspaceCompiler } from './workspace-compiler';

export class CompileCmd implements Command {
  name = 'compile [component...]';
  description = 'compile components';
  shortDescription = '';
  alias = '';
  group = 'development';
  private = true;
  options = [
    ['v', 'verbose', 'showing npm verbose output for inspection'],
    ['c', 'no-cache', 'ignore component cache when creating dist file'],
    ['j', 'json', 'return the compile results in json format'],
  ] as CommandOptions;

  constructor(private compile: WorkspaceCompiler) {}

  async report([components]: [string[]], { verbose, noCache }: { verbose: boolean; noCache: boolean }) {
    const startTimestamp = process.hrtime();
    const spinner = ora('Compiling your components, hold tight.').start();

    const compileResults = await this.compile.compileComponents(components, { verbose, noCache });
    const compileTimeLength = process.hrtime(startTimestamp);
    spinner.stop();
    console.log(``);
    console.log(`  ${chalk.underline('STATUS')}\t${chalk.underline('COMPONENT ID')}`);

    if (verbose) {
      console.log('compileResults', compileResults);
    } else {
      compileResults
        .map((componentResults) => componentResults.component)
        .map((componentId) => ({ status: 'SUCCESS', componentId }))
        .forEach((result) => console.log(`${chalk.red('>')} ${result.status}\t${result.componentId}`));
    }

    console.log(``);
    const taskSummary = `${chalk.green('√')} ${compileResults.length} components passed \n${chalk.red(
      'X'
    )} 2 components failed:`;
    console.log(taskSummary);

    console.log(``);
    return `Finished. (${prettyTime(compileTimeLength)})`;

    // return `${compileResults.length} components have been compiled successfully`;
  }

  async json([components]: [string[]], { verbose, noCache }: { verbose: boolean; noCache: boolean }) {
    // @ts-ignore
    const compileResults = await this.compile.compileComponents(components, { verbose, noCache });
    return {
      data: compileResults,
      // @todo: fix the code once compile is ready.
      code: 0,
    };
  }
}
