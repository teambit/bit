// :TODO make sure React is not an unused variable
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
import { Scripts } from './scripts';
import { Command, CLIArgs } from '../cli';
import { Flags, PaperOptions } from '../paper/command';

export class RunCmd implements Command {
  name = 'run <pipeline> [component...]';
  description =
    'increamantaly build any set of components with a configured build pipeline as defined in the component configuration. (builds new and modified components by default)';
  shortDescription = '';
  alias = '';
  group = '';

  // @ts-ignore
  options: PaperOptions = [
    [
      'c',
      'concurrency',
      'specify the number of concurrent build processes for Bit to run. default value depends on the operating system and the number of available CPU cores.'
    ]
  ];

  constructor(private scripts: Scripts) {}

  // json([id]: CLIArgs) {

  // }

  async render([pipeline, components]: CLIArgs, { concurrency }: Flags) {
    const concurrencyN = concurrency && typeof concurrency === 'string' ? Number.parseInt(concurrency) : 5;
    const actualComps = typeof components === 'string' ? [components] : components;
    const execute = await this.scripts.run(pipeline as string, actualComps, { concurrency: concurrencyN });
    const results = await execute.run();
    // @todo: this is hack to easily show the results
    const formatResult = result => {
      if (!result) return '';
      try {
        return JSON.stringify(result, undefined, 2);
      } catch (err) {
        return result.toString();
      }
    };
    // todo
    return (
      <div>
        ------------------------------------------------
        {results.map(res => (
          <div key={res.component.component.id._legacy.toString()}>
            <div>{res.component.component.id._legacy.toString()}</div>
            <div>started:{res.started}</div>
            <div>result:{formatResult(res.result)}</div>
            ------------------------------------------------
          </div>
        ))}
      </div>
    );
  }
}
