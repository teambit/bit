/** @flow */
import chalk from 'chalk';
import R from 'Ramda';
import Command from '../../command';
import { untrack } from '../../../api/consumer';

export default class Untrack extends Command {
  name = 'untrack [ids...]';
  description = 'untrack new components';
  alias = 'u';
  opts = [];
  loader = true;

  action([components]: [string[]]):Promise<*> {
    return untrack(components || []);
  }

  report({ untrackedComponents, unRemovableComponents, missingComponents }:
    { untrackedComponents: Array<string>,
      unRemovableComponents: Array<string>,
      missingComponents: Array<string>
    }):string {
    const msg = [];
    if (R.isEmpty(untrackedComponents) && R.isEmpty(unRemovableComponents) && R.isEmpty(missingComponents)) {
      return chalk.underline.red('no components untracked');
    }
    if (!R.isEmpty(untrackedComponents)) {
      const title = chalk.underline('untracked components:\n');
      msg.push(title + untrackedComponents.map(result => chalk.green(result)).join('\n'));
    }
    if (!R.isEmpty(unRemovableComponents)) {
      msg.push(chalk.red(`error: unable to untrack ${unRemovableComponents.join(', ')}, please use the bit remove command.\n`));
    }
    if (!R.isEmpty(missingComponents)) {
      msg.push(chalk.red(`fatal: component ${missingComponents.join(', ')} did not match any component.`));
    }
    return msg.join('\n');
  }
}
