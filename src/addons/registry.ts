import { Pipe, getDefaultOptions } from './pipe';
import { RunConfiguration } from './run-configuration';
import { PipeElement, PipeElementConfig } from './pipe-element';
import _ from 'lodash';
export type PipeRegistry = { [k: string]: Pipe };

export function getRegistry(runConfig: RunConfiguration): PipeRegistry {
  const registry: PipeRegistry = Object.keys(runConfig.raw)
    .filter(e => e !== 'aliases' && e !== 'runOptions')
    .reduce(function(accum, curr) {
      const rawPipe = runConfig.raw[curr] as PipeElementConfig[];
      const elements = rawPipe.map(e => new PipeElement(e));
      const options = _.get(runConfig.raw, `runOptions[${curr}]`, getDefaultOptions());
      const pipe = new Pipe(elements, options);
      accum[curr] = pipe;
      return accum;
    }, {});
  return registry;
}
