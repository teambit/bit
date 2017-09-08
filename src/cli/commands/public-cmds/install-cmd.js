/** @flow */
import Command from '../../command';
import { importAction } from '../../../api/consumer';
import Component from '../../../consumer/component';
import { ComponentWithDependencies } from '../../../scope';
import Import from './import-cmd';

/**
 * @deprecated
 */
export default class Install extends Command {
  name = 'install';
  description = 'install bit components from bit.json file';
  alias = '';
  opts = [
    ['e', 'environment', 'install development environment dependencies (compiler | tester)'],
    ['v', 'verbose', 'show a more verbose output when possible'],
    ['p', 'prefix', 'install components into a specific directory']
  ];
  loader = true;
  private = true;

  action(
    args: string[],
    {
      verbose,
      prefix,
      environment
    }: {
      verbose?: boolean,
      prefix?: boolean,
      environment?: boolean
    }
  ): Promise<any> {
    if (prefix) {
      return Promise.reject(new Error('prefix option currently not supported'));
    }

    return importAction({ ids: [], tester: false, compiler: false, verbose, prefix, environment });
  }

  report({
    dependencies,
    envDependencies,
    warnings
  }: {
    dependencies?: ComponentWithDependencies[],
    envDependencies?: Component[],
    warnings?: {
      notInPackageJson: [],
      notInNodeModules: [],
      notInBoth: []
    }
  }): string {
    const importCmd = new Import();
    return importCmd.report({ dependencies, envDependencies, warnings });
  }
}
