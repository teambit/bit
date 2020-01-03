import _ from 'lodash';
import { PipeElement, PipeElementConfig } from './pipe-element';
import { Pipe, getDefaultOptions } from './pipe';
import { RunConfiguration, RawRunConfiguration } from './run-configuration';

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

export function pipeRegistryToJSON(reg: PipeRegistry): RawRunConfiguration {
  return Object.keys(reg).reduce((accum, pipeName) => {
    accum[pipeName] = reg[pipeName].toJson();
    return accum;
  }, {});
}
