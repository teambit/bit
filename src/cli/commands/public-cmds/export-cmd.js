/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import Command from '../../command';
import { exportAction } from '../../../api/consumer';
import { BitId } from '../../../bit-id';
import { BASE_DOCS_DOMAIN, WILDCARD_HELP, CURRENT_UPSTREAM } from '../../../constants';
import type { EjectResults } from '../../../consumer/component-ops/eject-components';
import ejectTemplate from '../../templates/eject-template';

export default class Export extends Command {
  name = 'export [remote] [id...]';
  description = `export components to a remote scope.
  bit export <remote> [id...] => export (optionally given ids) to the specified remote
  bit export ${CURRENT_UPSTREAM} [id...] => export (optionally given ids) to their current scope
  bit export => export all staged components to their current scope
  https://${BASE_DOCS_DOMAIN}/docs/organizing-components-in-scopes.html
  ${WILDCARD_HELP('export remote-scope')}`;
  alias = 'e';
  opts = [
    ['e', 'eject', 'replaces the exported components from the local scope with the corresponding packages'],
    ['d', 'include-dependencies', "include the component's dependencies as part of the export to the remote scope"],
    ['f', 'force', 'force changing a component remote when exporting multiple components'],
    ['a', 'all', 'export all components include non-staged'],
    ['s', 'set-current-scope', "ensure the component's remote scope is set according to the target location"]
  ];
  loader = true;
  migration = true;

  action(
    [remote, ids]: [string, string[]],
    { eject = false, includeDependencies = false, setCurrentScope = false, all = false, force = false }: any
  ): Promise<*> {
    const currentScope = !remote || remote === CURRENT_UPSTREAM;
    if (currentScope && remote) {
      remote = '';
    }
    return exportAction({
      ids,
      remote,
      eject,
      includeDependencies,
      setCurrentScope,
      includeNonStaged: all,
      force
    }).then(results => ({
      ...results,
      remote
    }));
  }

  report({
    componentsIds,
    nonExistOnBitMap,
    missingScope,
    ejectResults,
    remote
  }: {
    componentsIds: BitId[],
    nonExistOnBitMap: BitId[],
    missingScope: BitId[],
    ejectResults: ?EjectResults,
    remote: string
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
      if (R.isEmpty(nonExistOnBitMap)) return '';
      const ids = nonExistOnBitMap.map(id => id.toString()).join(', ');
      return chalk.yellow(
        `${ids}\nexported successfully. bit did not update the workspace as the component files are not tracked. this might happen when a component was tracked in a different git branch. to fix it check if they where tracked in a different git branch, checkout to that branch and resync by running 'bit import'. or stay on your branch and track the components again using 'bit add'.`
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
