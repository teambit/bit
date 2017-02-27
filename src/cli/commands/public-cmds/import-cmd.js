/** @flow */
import R from 'ramda';
import chalk from 'chalk';
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

  action([id, ]: [string, ], { save, tester, compiler, verbose, prefix, dev }:
  { 
    save?: bool,
    tester?: bool,
    compiler?: bool,
    verbose?: bool,
    prefix?: bool,
    dev?: bool,
  }): Promise<any> {
    if (prefix) { return Promise.reject(new Error('prefix option currently not supported')); }
    // TODO - prefix returns true instead of the relevant string.
    // @TODO - import should support multiple components
    if (tester && compiler) {
      throw new Error('you cant use tester and compiler flags combined');
    }
    
    return importAction({ bitId: id, save, tester, compiler, verbose, prefix, dev });
  }

  report({ dependencies, envDependencies, warnings }: {
    dependencies?: Component[],
    envDependencies?: Component[],
    warnings?: {
      notInPackageJson: [],
      notInNodeModules: [],
      notInBoth:[],
    }
  }): string {
    let dependenciesOutput;
    let envDependenciesOutput;
    
    if (dependencies && !R.isEmpty(dependencies)) {
      dependenciesOutput = immutableUnshift(
        dependencies.map(formatBit),
        paintHeader('successfully imported the following Bit components and dependencies.')
      ).join('\n');
    }

    if (envDependencies && !R.isEmpty(envDependencies)) {
      envDependenciesOutput = immutableUnshift(
        envDependencies.map(formatBit),
        paintHeader('successfully imported the following Bit environments.')
      ).join('\n');
    }

    const getImportOutput = () => {
      if (dependenciesOutput && !envDependenciesOutput) return dependenciesOutput;
      if (!dependenciesOutput && envDependenciesOutput) return envDependenciesOutput;
      if (dependenciesOutput && envDependenciesOutput) {
        return `${dependenciesOutput}\n\n${envDependenciesOutput}`;
      }
      
      return 'nothing to import';
    };
    
    const getWarningOutput = () => {
      if (!warnings) return '';
      let output = '\n';

      if (!R.isEmpty(warnings.notInBoth)) {
        output += chalk.red.underline('\nerror - Missing the following package dependencies. Please install and add to package.json.\n');
        output += chalk.red(`${JSON.stringify(R.mergeAll(warnings.notInBoth))}\n`);
      }

      if (!R.isEmpty(warnings.notInPackageJson)) {
        output += chalk.yellow.underline('\nwarning - Add the following packages to package.json\n');
        output += chalk.yellow(`${JSON.stringify(R.mergeAll(warnings.notInPackageJson))}\n`);
      }

      if (!R.isEmpty(warnings.notInNodeModules)) {
        output += chalk.yellow.underline('\nwarning - Following packages are not installed. Please install them.\n');
        output += chalk.yellow(`${JSON.stringify(R.mergeAll(warnings.notInNodeModules))}\n`);
      }

      return output === '\n' ? '' : output;
    };

    return getImportOutput() + getWarningOutput();
  }
}
