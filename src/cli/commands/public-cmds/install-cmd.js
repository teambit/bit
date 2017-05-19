/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import Command from '../../command';
import { importAction } from '../../../api/consumer';
import { immutableUnshift } from '../../../utils';
import { formatBit, paintHeader } from '../../chalk-box';
import Component from '../../../consumer/component';
import { ComponentDependencies } from '../../../scope';
import Import from './import-cmd';

export default class Install extends Command {
  name = 'install';
  description = 'install bit components from bit.json file';
  alias = 'i';
  opts = [
    ['e', 'environment', 'install development environment dependencies (compiler | tester)'],
    ['v', 'verbose', 'show a more verbose output when possible'],
    ['p', 'prefix', 'install components into a specific directory'],
  ];
  loader = true;

  action(args: string[], { verbose, prefix, environment }:
  {
    verbose?: bool,
    prefix?: bool,
    environment?: bool,
  }): Promise<any> {
    if (prefix) { return Promise.reject(new Error('prefix option currently not supported')); }

    return importAction({ ids: [], tester: false, compiler: false, verbose, prefix, environment });
  }

  report({ dependencies, envDependencies, warnings }: {
    dependencies?: ComponentDependencies[],
    envDependencies?: Component[],
    warnings?: {
      notInPackageJson: [],
      notInNodeModules: [],
      notInBoth:[],
    }
  }): string {
    const importCmd = new Import();
    return importCmd.report({ dependencies, envDependencies, warnings });
  }
}
