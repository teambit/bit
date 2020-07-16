import React from 'react';
import { Command, CommandOptions } from '../cli';
import { Compile } from './compile';

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
    ['j', 'json', 'return the compile results in json format']
  ] as CommandOptions;

  constructor(private compile: Compile) {}

  async render([components]: [string[]], { verbose, noCache }: { verbose: boolean; noCache: boolean }) {
    // @ts-ignore
    const compileResults = await this.compile.compileOnWorkspace(components, { verbose, noCache });
    // eslint-disable-next-line no-console
    console.log('compileResults', compileResults);
    const output = `${compileResults.length} components have been compiled successfully`;
    return <div>{output}</div>;
  }

  async json([components]: [string[]], { verbose, noCache }: { verbose: boolean; noCache: boolean }) {
    // @ts-ignore
    const compileResults = await this.compile.compileOnWorkspace(components, { verbose, noCache });
    return {
      data: compileResults,
      // @todo: fix the code once compile is ready.
      code: 0
    };
  }
}
