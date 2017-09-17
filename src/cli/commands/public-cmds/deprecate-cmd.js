/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import { deprecate } from '../../../api/consumer';
import Command from '../../command';

export default class Deprecate extends Command {
  name = 'deprecate <ids...>';
  description = 'deprecate a component (local/remote)';
  alias = 'd';
  opts = [['r', 'remote [boolean]', 'remove from remote scope']];

  action([ids]: [string], { remote = false }: { remote: Boolean }): Promise<any> {
    return deprecate({ ids, remote });
  }

  report(bitObj: Object | Array<any>): string {
    return Array.isArray(bitObj) ? this.paintMany(bitObj) : this.paintSingle(bitObj);
  }

  paintMissingComponents = missingComponents =>
    (!R.isEmpty(missingComponents) ? chalk.underline('missing components:') + chalk(` ${missingComponents}\n`) : '');
  paintRemoved = bitIds =>
    (!R.isEmpty(bitIds) && !R.isNil(bitIds) ? chalk.underline('removed components:') + chalk(` ${bitIds}\n`) : '');
  paintSingle = bitObj => this.paintRemoved(bitObj.bitIds) + this.paintMissingComponents(bitObj.missingComponents);

  paintMany = bitObjs => bitObjs.map(obj => this.paintSingle(obj));
}
