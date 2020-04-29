// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
import { Command, CLIArgs } from '@bit/bit.core.cli';
import { Flags, PaperOptions } from '@bit/bit.core.paper';
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
    const compileResults = await this.compile.compile(components, { verbose, noCache });
    // eslint-disable-next-line no-console
    console.log('compileResults', compileResults);
    return <div>Compile has been completed successfully</div>;
  }

  async json([components]: CLIArgs, { verbose, noCache }: Flags) {
    // @ts-ignore
    const compileResults = await this.compile.compile(components, { verbose, noCache });
    return {
      data: compileResults,
      // @todo: fix the code once compile is ready.
      code: 0
    };
  }
}
