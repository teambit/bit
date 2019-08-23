/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import Command from '../../command';
import { forkAction } from '../../../api/consumer';
import { BitId } from '../../../bit-id';
import { WILDCARD_HELP } from '../../../constants';

export default class Fork extends Command {
  name = 'fork <remote> [id...]';
  description = `EXPERIMENTAL. fork components to a remote different than the current remote
  ${WILDCARD_HELP('fork remote-scope')}`;
  alias = '';
  opts = [
    ['a', 'all', 'fork all components including non-staged ones'],
    ['d', 'dependencies', 'replace the current remote with the new remote for all dependencies in the graph'],
    [
      'c',
      'code-mod',
      'change the source code by replacing the current remote import/require statements with the new one'
    ]
  ];
  loader = true;
  migration = true;

  action(
    [remote, ids]: [string, string[]],
    { all = false, dependencies = false, codeMod = false }: { all?: boolean, dependencies?: boolean, codeMod?: boolean }
  ): Promise<*> {
    return forkAction(ids, remote, all, dependencies, codeMod).then(results => ({
      ...results,
      remote
    }));
  }

  report({
    componentsIds,
    nonExistOnBitMap,
    remote
  }: {
    componentsIds: BitId[],
    nonExistOnBitMap: BitId[],
    remote: string
  }): string {
    if (R.isEmpty(componentsIds) && R.isEmpty(nonExistOnBitMap)) return chalk.yellow('nothing to fork');
    const exportOutput = () => {
      if (R.isEmpty(componentsIds)) return '';
      return chalk.green(
        `forked the following ${componentsIds.length} components to scope ${chalk.bold(remote)}:\n${chalk.bold(
          componentsIds.join('\n')
        )}`
      );
    };
    const nonExistOnBitMapOutput = () => {
      if (R.isEmpty(nonExistOnBitMap)) return '';
      const ids = nonExistOnBitMap.map(id => id.toString()).join(', ');
      return chalk.yellow(
        `${ids}\nforked successfully. bit did not update the workspace as the component files are not tracked. this might happen when a component was tracked in a different git branch. to fix it check if they where tracked in a different git branch, checkout to that branch and resync by running 'bit import'. or stay on your branch and track the components again using 'bit add'.`
      );
    };

    return nonExistOnBitMapOutput() + exportOutput();
  }
}
