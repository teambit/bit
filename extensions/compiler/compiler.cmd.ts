import { Command, CommandOptions } from '@teambit/cli';
import { Logger } from '@teambit/logger';
import chalk from 'chalk';
import prettyTime from 'pretty-time';

import { formatCompileResults } from './output-formatter';
import { WorkspaceCompiler } from './workspace-compiler';

export class CompileCmd implements Command {
  name = 'compile [component...]';
  description = 'Compile components';
  alias = '';
  group = 'component';
  options = [
    ['v', 'verbose', 'showing npm verbose output for inspection'],
    ['c', 'no-cache', 'ignore component cache when creating dist file'],
    ['j', 'json', 'return the compile results in json format'],
  ] as CommandOptions;

  constructor(private compile: WorkspaceCompiler, private logger: Logger) {}

  async report([components]: [string[]], { verbose, noCache }: { verbose: boolean; noCache: boolean }) {
    const startTimestamp = process.hrtime();
    this.logger.setStatusLine('Compiling your components, hold tight.');

    let outputString = '';
    const compileResults = await this.compile.compileComponents(components, { verbose, noCache });
    const compileTimeLength = process.hrtime(startTimestamp);

    outputString += '\n';
    outputString += `  ${chalk.underline('STATUS')}\t${chalk.underline('COMPONENT ID')}\n`;
    outputString += formatCompileResults(compileResults, verbose);
    outputString += '\n';

    const taskSummary = `${chalk.green('√')} ${compileResults.length} components passed\nFinished. (${prettyTime(
      compileTimeLength
    )})`;

    outputString += taskSummary;
    this.logger.clearStatusLine();

    return outputString;
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
