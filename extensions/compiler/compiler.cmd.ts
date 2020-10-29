import { Command, CommandOptions } from '@teambit/cli';
import { Logger } from '@teambit/logger';
import type { PubsubMain, BitBaseEvent } from '@teambit/pubsub';
import chalk from 'chalk';
import prettyTime from 'pretty-time';

import { formatCompileResults } from './output-formatter';
import { WorkspaceCompiler } from './workspace-compiler';

// IDs & events
import { CompilerAspect } from './compiler.aspect';
import { ComponentCompilationOnDoneEvent } from './events';

export class CompileCmd implements Command {
  componentsStatus: Array<any> = [];
  name = 'compile [component...]';
  description = 'Compile components';
  alias = '';
  group = 'component';
  options = [
    ['v', 'verbose', 'showing npm verbose output for inspection'],
    ['c', 'no-cache', 'ignore component cache when creating dist file'],
    ['j', 'json', 'return the compile results in json format'],
  ] as CommandOptions;

  constructor(private compile: WorkspaceCompiler, private logger: Logger, private pubsub: PubsubMain) {}

  async report([components]: [string[]], { verbose, noCache }: { verbose: boolean; noCache: boolean }) {
    return new Promise(async (resolve, reject) => {
      const startTimestamp = process.hrtime();
      this.logger.setStatusLine('Compiling your components, hold tight.');
      this.pubsub.sub(CompilerAspect.id, this.onComponentCompilationDone.bind(this));

      let outputString = '';

      await this.compile.compileComponents(components, { verbose, noCache });
      const compileTimeLength = process.hrtime(startTimestamp);

      outputString += '\n';
      outputString += `  ${chalk.underline('STATUS')}\t${chalk.underline('COMPONENT ID')}\n`;
      outputString += formatCompileResults(this.componentsStatus, verbose);
      outputString += '\n';

      outputString += this.getStatusLine(this.componentsStatus, compileTimeLength);

      this.logger.clearStatusLine();

      resolve({
        data: outputString,
        code: this.getExitCode(this.componentsStatus),
      });
    });
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

  private getSummaryIcon(componentsStatus) {
    switch (componentsStatus.filter((component) => component.errors.length).length) {
      case 0:
        return chalk.green('✔');
      case componentsStatus.length:
        return chalk.red('✗');
      default:
        return chalk.yellow('⍻');
    }
  }

  private getExitCode(componentsStatus) {
    return componentsStatus.filter((component) => component.errors.length).length ? 1 : 0;
  }

  private getStatusLine(componentsStatus, compileTimeLength) {
    const numberOfComponents = componentsStatus.length;
    const numberOfFailingComponents = componentsStatus.filter((component) => component.errors.length).length;
    const numberOfSuccessfulComponents = componentsStatus.filter((component) => !component.errors.length).length;

    const icon = this.getSummaryIcon(componentsStatus);
    const summaryLine = numberOfFailingComponents
      ? `${icon} ${numberOfFailingComponents}\\${numberOfComponents} components failed to compile.`
      : `${icon} ${numberOfSuccessfulComponents}\\${numberOfComponents} components compiled sucssefuly.`;

    return `${summaryLine}\nFinished. (${prettyTime(compileTimeLength)})`;
  }

  private onComponentCompilationDone(event: BitBaseEvent<any>) {
    if (event.type === ComponentCompilationOnDoneEvent.TYPE) {
      this.componentsStatus.push(event.data);
    }
  }
}
