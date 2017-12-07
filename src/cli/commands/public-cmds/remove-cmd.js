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
    ['f', 'force [boolean]', 'force remove (default = false)'],
    ['t', 'track [boolean]', 'keep tracking component (default = false) ']
  ];
  loader = true;
  migration = true;

  action([ids]: [string], { force = false, track = false }: { force: boolean, track: boolean }): Promise<any> {
    return remove({ ids, force, track });
  }

  report(bitObj: object | Array<any>): string {
    return Array.isArray(bitObj) ? this.paintMany(bitObj) : this.paintSingle(bitObj);
  }

  paintMissingComponents = missingComponents =>
    (!R.isEmpty(missingComponents) && !R.isNil(missingComponents)
      ? chalk.red.underline('missing components:') + chalk(` ${missingComponents}\n`)
      : '');
  paintRemoved = bitIds =>
    (!R.isEmpty(bitIds) && !R.isNil(bitIds)
      ? chalk.green.underline('successfully removed components:') + chalk(` ${bitIds}\n`)
      : '');
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
