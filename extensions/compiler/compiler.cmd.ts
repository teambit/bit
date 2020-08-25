/* eslint-disable no-console */
import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';

// import cliSpinners from 'cli-spinners';
// import ora, { Ora, PersistOptions } from 'ora';
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
    // console.log(cliSpinners.dots);
    // this.spinner.start(text);
    // (this.createNewSpinner()).start();
    // const spinner = ora('Loading unicorns').start();
    // setTimeout(() => {
    //   spinner.color = 'yellow';
    //   spinner.text = 'Loading rainbows';
    // }, 1000);

    const compileResults = await this.compile.compileComponents(components, { verbose, noCache });
    console.log(`  ${chalk.underline('STATUS')}\t${chalk.underline('COMPONENT ID')}`);

    if (verbose) {
      console.log('compileResults', compileResults);
    } else {
      compileResults
        .map((componentResults) => componentResults.component)
        .map((componentId) => ({ status: 'SUCCESS', componentId }))
        .forEach((result) => console.log(`${chalk.red('>')} ${result.status}\t${result.componentId}`));
    }

    return `${compileResults.length} components have been compiled successfully`;
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

  // private createNewSpinner(): Ora {
  //   return ora({ spinner: cliSpinners.dots12, text: '' });
  // }
}
