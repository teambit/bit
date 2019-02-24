/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import Command from '../../command';
import { exportAction } from '../../../api/consumer';
import { BitId } from '../../../bit-id';
import { BASE_DOCS_DOMAIN } from '../../../constants';
import type { EjectResults } from '../../../consumer/component-ops/eject-components';
import ejectTemplate from '../../templates/eject-template';

export default class Export extends Command {
  name = 'export <remote> [id...]';
  description = `export components to a remote scope.
  https://${BASE_DOCS_DOMAIN}/docs/organizing-components-in-scopes.html
  the id can be used with wildcards (e.g. bit export remote-scope "utils/*")`;
  alias = 'e';
  opts = [
    ['f', 'forget', 'do not save to bit.json after export'],
    ['e', 'eject', 'replaces the exported components from the local scope with the corresponding packages']
  ];
  loader = true;
  migration = true;

  action([remote, ids]: [string, string[]], { forget, eject }: any): Promise<*> {
    return exportAction(ids, remote, !forget, eject).then(({ componentsIds, ejectResults }) => ({
      componentsIds,
      ejectResults,
      remote
    }));
  }

  report({
    componentsIds,
    ejectResults,
    remote
  }: {
    componentsIds: BitId[],
    ejectResults: ?EjectResults,
    remote: string
  }): string {
    if (R.isEmpty(componentsIds)) return chalk.yellow('nothing to export');
    const exportOutput = () => {
      return chalk.green(`exported ${componentsIds.length} components to scope ${chalk.bold(remote)}`);
    };
    const ejectOutput = () => {
      if (!ejectResults) return '';
      const output = ejectTemplate(ejectResults);
      return `\n${output}`;
    };

    return exportOutput() + ejectOutput();
  }
}
