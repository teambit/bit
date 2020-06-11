// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
import { Command, CLIArgs } from '../cli';
import { Flags, PaperOptions } from '../paper';
import { Compile } from './compile';

export class CompileCmd implements Command {
  name = 'compile [component...]';
  description = 'compile components';
  shortDescription = '';
  alias = '';
  group = '';
  options = [
    ['v', 'verbose', 'showing npm verbose output for inspection'],
    ['c', 'no-cache', 'ignore component cache when creating dist file'],
    ['j', 'json', 'return the compile results in json format']
  ] as PaperOptions;

  constructor(private compile: Compile) {}

  async render([components]: CLIArgs, { verbose, noCache }: Flags) {
    // @ts-ignore
    const compileResults = await this.compile.compileOnWorkspace(components, { verbose, noCache });
    // eslint-disable-next-line no-console
    console.log('compileResults', compileResults);
    const output = `${compileResults.length} components have been compiled successfully`;
    return <div>{output}</div>;
  }

  async json([components]: CLIArgs, { verbose, noCache }: Flags) {
    // @ts-ignore
    const compileResults = await this.compile.compileOnWorkspace(components, { verbose, noCache });
    return {
      data: compileResults,
      // @todo: fix the code once compile is ready.
      code: 0
    };
  }
}
