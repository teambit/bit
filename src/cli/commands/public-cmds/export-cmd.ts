import R from 'ramda';
import chalk from 'chalk';
import Command from '../../command';
import { exportAction } from '../../../api/consumer';
import { BitId } from '../../../bit-id';
import { BASE_DOCS_DOMAIN, WILDCARD_HELP, CURRENT_UPSTREAM } from '../../../constants';
import { EjectResults } from '../../../consumer/component-ops/eject-components';
import ejectTemplate from '../../templates/eject-template';
import GeneralError from '../../../error/general-error';

export default class Export extends Command {
  name = 'export [remote] [id...]';
  description = `export components to a remote scope.
  bit export <remote> [id...] => export (optionally given ids) to the specified remote
  bit export ${CURRENT_UPSTREAM} [id...] => export (optionally given ids) to their current scope
  bit export => export all staged components to their current scope
  https://${BASE_DOCS_DOMAIN}/docs/export
  ${WILDCARD_HELP('export remote-scope')}`;
  alias = 'e';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  opts = [
    ['e', 'eject', 'replaces the exported components from the local scope with the corresponding packages'],
    ['a', 'all', 'export all components include non-staged'],
    [
      'd',
      'include-dependencies',
      "EXPERIMENTAL. include the component's dependencies as part of the export to the remote scope"
    ],
    [
      's',
      'set-current-scope',
      "EXPERIMENTAL. ensure the component's remote scope is set according to the target location"
    ],
    [
      'r',
      'rewire',
      'EXPERIMENTAL. when exporting to a different scope, replace import/require statements in the source code to the new scope'
    ],
    ['f', 'force', 'force changing a component remote without asking for a confirmation']
  ];
  loader = true;
  migration = true;
  remoteOp = true;

  action(
    [remote, ids]: [string, string[]],
    {
      eject = false,
      includeDependencies = false,
      setCurrentScope = false,
      all = false,
      force = false,
      rewire = false
    }: any
  ): Promise<any> {
    const currentScope = !remote || remote === CURRENT_UPSTREAM;
    if (currentScope && remote) {
      remote = '';
    }
    if (includeDependencies && !remote) {
      throw new GeneralError(
        'to use --includeDependencies, please specify a remote (the default remote gets already the dependencies)'
      );
    }
    if (rewire && !includeDependencies) {
      throw new GeneralError(
        'to use --rewire, please enter --include-dependencies as well (there is no point of changing the require/import of dependencies without changing themselves)'
      );
    }
    return exportAction({
      ids,
      remote,
      eject,
      includeDependencies,
      setCurrentScope,
      includeNonStaged: all,
      codemod: rewire,
      force
    }).then(results => ({
      ...results,
      remote,
      includeDependencies
    }));
  }

  report({
    componentsIds,
    nonExistOnBitMap,
    missingScope,
    ejectResults,
    remote,
    includeDependencies
  }: {
    componentsIds: BitId[];
    nonExistOnBitMap: BitId[];
    missingScope: BitId[];
    ejectResults: EjectResults | null | undefined;
    remote: string;
    includeDependencies: boolean;
  }): string {
    if (R.isEmpty(componentsIds) && R.isEmpty(nonExistOnBitMap) && R.isEmpty(missingScope)) {
      return chalk.yellow('nothing to export');
    }
    const exportOutput = () => {
      if (R.isEmpty(componentsIds)) return '';
      if (remote) return chalk.green(`exported ${componentsIds.length} components to scope ${chalk.bold(remote)}`);
      return chalk.green(
        `exported the following ${componentsIds.length} component(s):\n${chalk.bold(componentsIds.join('\n'))}`
      );
    };
    const nonExistOnBitMapOutput = () => {
      // if includeDependencies is true, the nonExistOnBitMap might be the dependencies
      if (R.isEmpty(nonExistOnBitMap) || includeDependencies) return '';
      const ids = nonExistOnBitMap.map(id => id.toString()).join(', ');
      return chalk.yellow(
        `${ids}\nexported successfully. bit did not update the workspace as the component files are not tracked. this might happen when a component was tracked in a different git branch. to fix it check if they where tracked in a different git branch, checkout to that branch and resync by running 'bit import'. or stay on your branch and track the components again using 'bit add'.\n`
      );
    };
    const missingScopeOutput = () => {
      if (R.isEmpty(missingScope)) return '';
      const ids = missingScope.map(id => id.toString()).join(', ');
      return chalk.yellow(
        `the following component(s) were not exported: ${chalk.bold(
          ids
        )}.\nplease specify <remote> to export them, or set a "defaultScope" in your workspace config\n\n`
      );
    };
    const ejectOutput = () => {
      if (!ejectResults) return '';
      const output = ejectTemplate(ejectResults);
      return `\n${output}`;
    };

    return nonExistOnBitMapOutput() + missingScopeOutput() + exportOutput() + ejectOutput();
  }
}
