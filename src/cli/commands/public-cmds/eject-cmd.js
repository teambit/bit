/** @flow */
import R from 'ramda';
import Command from '../../command';
import { ejectAction } from '../../../api/consumer';
import { BitId } from '../../../bit-id';

const chalk = require('chalk');

export default class Eject extends Command {
  name = 'eject <id...>';
  description = 'remove components from the local scope and install them by the NPM client';
  alias = 'E';
  opts = [['f', 'force', 'ignore local version. remove the components even when they are staged or modified']];
  loader = true;
  migration = true;

  action([ids]: [string[]], { force }: { force: boolean }): Promise<*> {
    return ejectAction(ids, force);
  }

  report(results): string {
    console.log('TCL: ------------------------------');
    console.log('TCL: Eject -> results', results);
    console.log('TCL: ------------------------------');
    return results;

    // return chalk.green(`exported component ${chalk.bold(componentId.toString())} to scope ${chalk.bold(remote)}`);
  }
}
