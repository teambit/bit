/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import Command from '../../command';
import { remove } from '../../../api/consumer';

export default class Remove extends Command {
  name = 'remove <ids...>';
  description = 'remove a component (local/remote)';
  alias = 'rm';
  opts = [
    ['f', 'force [boolean]', 'force delete (default = false)'],
    ['r', 'remote [boolean]', 'remove from remote scope']
  ];

  action([ids]: [string], { force = false, remote = false }: { force: boolean, remote: boolean }): Promise<any> {
    return remove({ ids, force, remote });
  }

  report(bitObj: object | Array<any>): string {
    return Array.isArray(bitObj) ? this.paintMany(bitObj) : this.paintSingle(bitObj);
  }

  paintMissingComponents = missingComponents =>
    (!R.isEmpty(missingComponents) && R.isNil(missingComponents)
      ? chalk.underline('missing components:') + chalk(` ${missingComponents}\n`)
      : '');
  paintRemoved = bitIds =>
    (!R.isEmpty(bitIds) && !R.isNil(bitIds) ? chalk.underline('removed components:') + chalk(` ${bitIds}\n`) : '');
  paintSingle = bitObj =>
    this.paintUnRemovedComponents(bitObj.dependentBits) +
    this.paintRemoved(bitObj.bitIds) +
    this.paintMissingComponents(bitObj.missingComponents);

  paintUnRemovedComponents(unRemovedComponents) {
    if (!R.isEmpty(unRemovedComponents) && !R.isNil(unRemovedComponents)) {
      return Object.keys(unRemovedComponents).map((key) => {
        const header = chalk.underline.red(
          `error: unable to delete ${key}, because the following components depend on it:\n`
        );
        const body = unRemovedComponents[key].join('\n');
        return `${header + body}\n`;
      });
    }
    return '';
  }

  paintMany = bitObjs => bitObjs.map(obj => this.paintSingle(obj));
}
