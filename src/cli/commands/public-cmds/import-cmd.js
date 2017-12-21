/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import Command from '../../command';
import { importAction } from '../../../api/consumer';
import { immutableUnshift } from '../../../utils';
import { formatPlainComponentItem } from '../../chalk-box';
import Component from '../../../consumer/component';
import { ComponentWithDependencies } from '../../../scope';

export default class Import extends Command {
  name = 'import [ids...]';
  description = 'import components into your current working area.';
  alias = 'i';
  opts = [
    ['t', 'tester', 'import a tester environment component'],
    ['c', 'compiler', 'import a compiler environment component'],
    ['e', 'environment', 'install development environment dependencies (compiler and tester)'],
    ['p', 'prefix <prefix>', 'import components into a specific directory'],
    ['d', 'display-dependencies', 'display the imported dependencies'],
    ['f', 'force', 'ignore local changes'],
    ['', 'dist', 'write dist files (when exist) to the configured directory'],
    ['', 'conf', 'write the configuration file (bit.json)'],
    ['', 'skip-npm-install', 'do not install packages of the imported components'],
    ['', 'ignore-package-json', 'do not generate package.json for the imported component(s)']
  ];
  loader = true;
  migration = true;

  action(
    [ids]: [string[]],
    {
      tester,
      compiler,
      verbose = false,
      prefix,
      displayDependencies,
      environment,
      force = false,
      dist = false,
      conf = false,
      skipNpmInstall = false,
      ignorePackageJson = false
    }: {
      tester?: boolean,
      compiler?: boolean,
      verbose?: boolean,
      prefix?: string,
      displayDependencies?: boolean,
      environment?: boolean,
      force?: boolean,
      dist?: boolean,
      conf?: boolean,
      skipNpmInstall?: boolean,
      ignorePackageJson?: boolean
    }
  ): Promise<any> {
    // @TODO - import should support multiple components
    if (tester && compiler) {
      throw new Error('you cant use tester and compiler flags combined');
    }

    return importAction({
      ids,
      tester,
      compiler,
      verbose,
      prefix,
      environment,
      force,
      dist,
      conf,
      installNpmPackages: !skipNpmInstall,
      withPackageJson: !ignorePackageJson
    }).then(importResults => R.assoc('displayDependencies', displayDependencies, importResults));
  }

  report({
    dependencies,
    envDependencies,
    warnings,
    displayDependencies
  }: {
    dependencies?: ComponentWithDependencies[],
    envDependencies?: Component[],
    warnings?: {
      notInPackageJson: [],
      notInNodeModules: [],
      notInBoth: []
    },
    displayDependencies?: boolean
  }): string {
    let dependenciesOutput;
    let envDependenciesOutput;

    if (dependencies && !R.isEmpty(dependencies)) {
      const components = dependencies.map(R.prop('component'));
      const peerDependencies = R.flatten(dependencies.map(R.prop('dependencies')));

      let componentDependenciesOutput = '';
      if (components.length === 1) {
        componentDependenciesOutput = immutableUnshift(
          components.map(formatPlainComponentItem),
          chalk.green('successfully imported one component')
        ).join('\n');
      } else {
        componentDependenciesOutput = immutableUnshift(
          components.map(formatPlainComponentItem),
          chalk.green(`successfully imported ${components.length} components`)
        ).join('\n');
      }

      const peerDependenciesOutput =
        peerDependencies && !R.isEmpty(peerDependencies) && displayDependencies
          ? immutableUnshift(
            R.uniq(peerDependencies.map(formatPlainComponentItem)),
            chalk.green(`\n\nsuccessfully imported ${components.length} component dependencies`)
          ).join('\n')
          : '';

      dependenciesOutput = componentDependenciesOutput + peerDependenciesOutput;
    }

    if (envDependencies && !R.isEmpty(envDependencies)) {
      envDependenciesOutput = immutableUnshift(
        envDependencies.map(formatPlainComponentItem),
        chalk.green('the following component environments were installed')
      ).join('\n');
    }

    const getImportOutput = () => {
      if (dependenciesOutput && !envDependenciesOutput) return dependenciesOutput;
      if (!dependenciesOutput && envDependenciesOutput) return envDependenciesOutput;
      if (dependenciesOutput && envDependenciesOutput) {
        return `${dependenciesOutput}\n\n${envDependenciesOutput}`;
      }

      return chalk.yellow('nothing to import');
    };

    const logObject = obj => `> ${R.keys(obj)[0]}: ${R.values(obj)[0]}`;
    const getWarningOutput = () => {
      if (!warnings) return '';
      let output = '\n';

      if (!R.isEmpty(warnings.notInBoth)) {
        output += chalk.red.underline(
          '\nerror - missing the following package dependencies. please install and add to package.json.\n'
        );
        output += chalk.red(`${warnings.notInBoth.map(logObject).join('\n')}\n`);
      }

      if (!R.isEmpty(warnings.notInPackageJson)) {
        output += chalk.yellow.underline('\nwarning - add the following packages to package.json\n');
        output += chalk.yellow(`${warnings.notInPackageJson.map(logObject).join('\n')}\n`);
      }

      if (!R.isEmpty(warnings.notInNodeModules)) {
        output += chalk.yellow.underline('\nwarning - following packages are not installed. please install them.\n');
        output += chalk.yellow(`${warnings.notInNodeModules.map(logObject).join('\n')}\n`);
      }

      return output === '\n' ? '' : output;
    };

    return getImportOutput() + getWarningOutput();
  }
}
