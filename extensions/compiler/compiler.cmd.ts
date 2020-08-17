import { Command, CommandOptions } from '@teambit/cli';
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
    const compileResults = await this.compile.compileComponents(components, { verbose, noCache });
    // eslint-disable-next-line no-console
    console.log('compileResults', compileResults);
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
}
