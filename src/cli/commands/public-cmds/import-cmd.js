/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import Command from '../../command';
import { importAction } from '../../../api/consumer';
import { immutableUnshift } from '../../../utils';
import { formatBit, paintHeader } from '../../chalk-box';
import Component from '../../../consumer/component';
import { ComponentWithDependencies } from '../../../scope';

export default class Import extends Command {
  name = 'import [ids...]';
  description = 'import components into your current working area.';
  alias = 'i';
  opts = [
    ['t', 'tester', 'import a tester environment component'],
    ['v', 'verbose', 'show a more verbose output when possible'],
    ['c', 'compiler', 'import a compiler environment component'],
    ['p', 'prefix <prefix>', 'import components into a specific directory'],
    ['d', 'display_dependencies', 'display the imported dependencies']
  ];
  loader = true;

  action([ids, ]: [string[], ], { tester, compiler, verbose, prefix, display_dependencies }:
  {
    tester?: bool,
    compiler?: bool,
    verbose?: bool,
    prefix?: string,
  }): Promise<any> {
    // @TODO - import should support multiple components
    if (tester && compiler) {
      throw new Error('you cant use tester and compiler flags combined');
    }

    return importAction({ ids, tester, compiler, verbose, prefix, environment: false })
      .then(importResults => R.assoc('display_dependencies', display_dependencies, importResults));
  }

  report({ dependencies, envDependencies, warnings, display_dependencies }: {
    dependencies?: ComponentWithDependencies[],
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
      const components = dependencies.map(R.prop('component'));
      const peerDependencies = R.flatten(dependencies.map(R.prop('dependencies')));

      const componentDependenciesOutput = immutableUnshift(
        components.map(formatBit),
        paintHeader('successfully imported the following Bit components.')
      ).join('\n');

      const peerDependenciesOutput = (peerDependencies && !R.isEmpty(peerDependencies)
      && display_dependencies) ?
      immutableUnshift(
        R.uniq(peerDependencies.map(formatBit)),
        paintHeader('\n\nsuccessfully imported the following peer dependencies.')
      ).join('\n') : '';

      dependenciesOutput = componentDependenciesOutput + peerDependenciesOutput;
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

    const logObject = obj => `> ${R.keys(obj)[0]}: ${R.values(obj)[0]}`;
    const getWarningOutput = () => {
      if (!warnings) return '';
      let output = '\n';

      if (!R.isEmpty(warnings.notInBoth)) {
        output += chalk.red.underline('\nerror - Missing the following package dependencies. Please install and add to package.json.\n');
        output += chalk.red(`${warnings.notInBoth.map(logObject).join('\n')}\n`);
      }

      if (!R.isEmpty(warnings.notInPackageJson)) {
        output += chalk.yellow.underline('\nwarning - Add the following packages to package.json\n');
        output += chalk.yellow(`${warnings.notInPackageJson.map(logObject).join('\n')}\n`);
      }

      if (!R.isEmpty(warnings.notInNodeModules)) {
        output += chalk.yellow.underline('\nwarning - Following packages are not installed. Please install them.\n');
        output += chalk.yellow(`${warnings.notInNodeModules.map(logObject).join('\n')}\n`);
      }

      return output === '\n' ? '' : output;
    };

    return getImportOutput() + getWarningOutput();
  }
}
