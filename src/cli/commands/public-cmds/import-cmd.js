/** @flow */
import R from 'ramda';
import Command from '../../command';
import { importAction } from '../../../api/consumer';
import { immutableUnshift } from '../../../utils';
import { formatBit, paintHeader } from '../../chalk-box';
import Component from '../../../consumer/component';

export default class Import extends Command {
  name = 'import [ids]';
  description = 'import a component';
  alias = 'i';
  opts = [
    ['s', 'save', 'save into bit.json'],
    ['d', 'dev', 'also import dev dependencies (compiler | tester)'],
    ['t', 'tester', 'import a tester environment component'],
    ['v', 'verbose', 'show a more verbose output when possible'],
    ['c', 'compiler', 'import a compiler environment component'],
    ['p', 'prefix', 'import components into a specific directory'],
  ];
  loader = true;

  action([id, ]: [string, ], { save, tester, compiler, verbose, prefix, dev }: any): Promise<any> {
    if (prefix) { return Promise.reject(new Error('prefix option currently not supported')); }
    // TODO - prefix returns true instead of the relevant string.
    // @TODO - import should support multiple components
    if (tester && compiler) {
      throw new Error('you cant use tester and compiler flags combined');
    }
    
    return importAction({ bitId: id, save, tester, compiler, verbose, prefix, dev });
  }

  report({ dependencies, envDependencies }: 
  { dependencies?: Component[], envDependencies?: Component[] }): string {
    let dependenciesOutput;
    let envDependenciesOutput;
    
    if (dependencies && !R.isEmpty(dependencies)) {
      dependenciesOutput = immutableUnshift(
        dependencies.map(formatBit),
        paintHeader('imported the following dependencies:')
      ).join('\n');
    }

    if (envDependencies && !R.isEmpty(envDependencies)) {
      envDependenciesOutput = immutableUnshift(
        envDependencies.map(formatBit),
        paintHeader('imported the following environment dependencies:')
      ).join('\n');
    }

    if (dependenciesOutput && !envDependenciesOutput) return dependenciesOutput;
    if (!dependenciesOutput && envDependenciesOutput) return envDependenciesOutput;
    if (dependenciesOutput && envDependenciesOutput) {
      return `${dependenciesOutput}\n\n${envDependenciesOutput}`;
    }
    
    return 'nothing to import';
  }
}
