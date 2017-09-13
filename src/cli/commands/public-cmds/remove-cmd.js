/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import Command from '../../command';
import { remove } from '../../../api/consumer';

export default class Remove extends Command {
  name = 'remove <ids...>';
  description = 'remove a bit';
  alias = 'rm';
  opts = [
    ['h', 'hard [boolean]', 'delete component with dependencies(default = false)'],
    ['f', 'force [boolean]', 'delete components with dependencies and remove files(default = false)'],
    ['r', 'remote [boolean]', 'remove from remote scope']
  ];

  action(
    [ids]: [string],
    { hard = false, force = false, remote = false }: { hard: Boolean, force: Boolean, remote: Boolean }
  ): Promise<any> {
    return remove({ ids, hard, force, remote });
  }

  report(bitObj: object | Array<any>): string {
    return Array.isArray(bitObj) ? this.paintMany(bitObj) : this.paintSingle(bitObj);
  }

  paintMissingComponents = missingComponents =>
    (!R.isEmpty(missingComponents) ? chalk.underline('missing components:') + chalk(` ${missingComponents}\n`) : '');
  paintRemoved = bitIds => (!R.isEmpty(bitIds) ? chalk.underline('removed components:') + chalk(` ${bitIds}\n`) : '');
  paintSingle = bitObj =>
    this.paintUnRemovedComponents(bitObj.unRemovedComponents) +
    this.paintRemoved(bitObj.bitIds) +
    this.paintMissingComponents(bitObj.missingComponents);

  paintUnRemovedComponents(unRemovedComponents) {
    if (!R.isEmpty(unRemovedComponents)) {
      return Object.keys(unRemovedComponents).map((key) => {
        const header = chalk.underline.red(
          `error: unable to delete ${key}, because the following components depend on it:\n`
        );
        const body = unRemovedComponents[key].join('\n');
        return header + body;
      });
    }
    return '';
  }

  paintMany = bitObjs => bitObjs.map(obj => this.paintSingle(obj));
}
