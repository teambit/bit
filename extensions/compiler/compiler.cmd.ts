/* TODO[uri]:
  1. Indication for Failures
  2. Sorting the verbose
*/

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

    let compileResults;
    try {
      compileResults = await this.compile.compileComponents(components, { verbose, noCache });
    } catch (err) {
      spinner.stop();
      console.error(``, err);

      console.log('');
      return `Finished. (${prettyTime(process.hrtime(startTimestamp))})`;
    }

    const compileTimeLength = process.hrtime(startTimestamp);
    spinner.stop();
    console.log(``);
    console.log(`  ${chalk.underline('STATUS')}\t${chalk.underline('COMPONENT ID')}`);

    if (verbose) {
      compileResults
        .map((componentResults) => ({
          componentId: componentResults.component,
          files: componentResults.buildResults,
          status: 'SUCCESS',
        }))
        .forEach((result) => {
          console.log(`${chalk.green('√')} ${result.status}\t${result.componentId}`);
          result?.files?.forEach((file) => console.log(`\t\t - ${file}`));
        });
    } else {
      compileResults
        .map((componentResults) => componentResults.component)
        .map((componentId) => ({ componentId, status: 'SUCCESS' }))
        .forEach((result) => console.log(`${chalk.green('√')} ${result.status}\t${result.componentId}`));
    }

    console.log(``);
    const taskSummary = `${chalk.green('√')} ${compileResults.length} components passed \n`;
    console.log(taskSummary);

    console.log(``);
    return `Finished. (${prettyTime(compileTimeLength)})`;
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
