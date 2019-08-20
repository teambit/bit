/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import Command from '../../command';
import { exportAction } from '../../../api/consumer';
import { BitId } from '../../../bit-id';
import { BASE_DOCS_DOMAIN, WILDCARD_HELP } from '../../../constants';
import type { EjectResults } from '../../../consumer/component-ops/eject-components';
import ejectTemplate from '../../templates/eject-template';

export default class Export extends Command {
  name = 'export <remote> [id...]';
  description = `export components to a remote scope.
  https://${BASE_DOCS_DOMAIN}/docs/organizing-components-in-scopes.html
  ${WILDCARD_HELP('export remote-scope')}`;
  alias = 'e';
  opts = [['e', 'eject', 'replaces the exported components from the local scope with the corresponding packages']];
  loader = true;
  migration = true;

  action([remote, ids]: [string, string[]], { eject }: any): Promise<*> {
    return exportAction(ids, remote, eject).then(results => ({
      ...results,
      remote
    }));
  }

  report({
    componentsIds,
    nonExistOnBitMap,
    ejectResults,
    remote
  }: {
    componentsIds: BitId[],
    nonExistOnBitMap: BitId[],
    ejectResults: ?EjectResults,
    remote: string
  }): string {
    if (R.isEmpty(componentsIds) && R.isEmpty(nonExistOnBitMap)) return chalk.yellow('nothing to export');
    const exportOutput = () => {
      if (R.isEmpty(componentsIds)) return '';
      return chalk.green(`exported ${componentsIds.length} components to scope ${chalk.bold(remote)}`);
    };
    const nonExistOnBitMapOutput = () => {
      if (R.isEmpty(nonExistOnBitMap)) return '';
      const ids = nonExistOnBitMap.map(id => id.toString()).join(', ');
      return chalk.yellow(
        `${ids}\nexported successfully. bit did not update the workspace as the component files are not tracked. this might happen when a component was tracked in a different git branch. to fix it check if they where tracked in a different git branch, checkout to that branch and resync by running 'bit import'. or stay on your branch and track the components again using 'bit add'.`
      );
    };
    const ejectOutput = () => {
      if (!ejectResults) return '';
      const output = ejectTemplate(ejectResults);
      return `\n${output}`;
    };

    return nonExistOnBitMapOutput() + exportOutput() + ejectOutput();
  }
}
