/** @flow */
import chalk from 'chalk';
import R from 'ramda';
import Command from '../../command';
import { untrack } from '../../../api/consumer';
import GeneralError from '../../../error/general-error';
import { BASE_DOCS_DOMAIN } from '../../../constants';

export default class Untrack extends Command {
  name = 'untrack [ids...]';
  description = `untrack a new component(s)
  https://${BASE_DOCS_DOMAIN}/docs/cli-untrack.html
  the id can be used with wildcards (e.g. bit untrack "utils/*")`;
  alias = 'u';
  opts = [['a', 'all', 'revert add for all tracked components']];
  loader = true;
  migration = true;

  action([components]: [string[]], { all }: { all: ?boolean }): Promise<*> {
    if ((!R.isEmpty(components) && all) || (R.isEmpty(components) && !all)) {
      throw new GeneralError(
        'you can use either a specific component [id] to untrack a particular component or --all flag to untrack them all'
      );
    }
    return untrack(components || [], all);
  }

  report({
    untrackedComponents,
    unRemovableComponents,
    missingComponents
  }: {
    untrackedComponents: Array<string>,
    unRemovableComponents: Array<string>,
    missingComponents: Array<string>
  }): string {
    const msg = [];
    if (R.isEmpty(untrackedComponents) && R.isEmpty(unRemovableComponents) && R.isEmpty(missingComponents)) {
      return chalk.underline.red('no components untracked');
    }
    if (!R.isEmpty(untrackedComponents)) {
      const title = chalk.underline('untracked components:\n');
      msg.push(title + untrackedComponents.map(result => chalk.green(result)).join('\n'));
    }
    if (!R.isEmpty(unRemovableComponents)) {
      msg.push(
        chalk.red(`error: unable to untrack ${unRemovableComponents.join(', ')}, please use the bit remove command.\n`)
      );
    }
    if (!R.isEmpty(missingComponents)) {
      msg.push(chalk.red(`fatal: component ${missingComponents.join(', ')} did not match any component.`));
    }
    return msg.join('\n');
  }
}
