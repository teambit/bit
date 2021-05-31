import chalk from 'chalk';
import R from 'ramda';

import { untrack } from '../../../api/consumer';
import { BASE_DOCS_DOMAIN, WILDCARD_HELP } from '../../../constants';
import GeneralError from '../../../error/general-error';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class Untrack implements LegacyCommand {
  name = 'untrack [ids...]';
  description = `DEPRECATED (use "bit remove" instead). untrack a new component(s)
  https://${BASE_DOCS_DOMAIN}/docs/add-and-isolate-components#untracking-components
  ${WILDCARD_HELP('untrack')}`;
  alias = 'u';
  opts = [['a', 'all', 'revert add for all tracked components']] as CommandOptions;
  loader = true;
  migration = true;
  private = true; // it's deprecated

  action([components]: [string[]], { all }: { all: boolean | null | undefined }): Promise<any> {
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
    missingComponents,
  }: {
    untrackedComponents: Array<string>;
    unRemovableComponents: Array<string>;
    missingComponents: Array<string>;
  }): string {
    const msg = [chalk.yellow(`untrack has deprecated, please use "bit remove".`)];
    if (R.isEmpty(untrackedComponents) && R.isEmpty(unRemovableComponents) && R.isEmpty(missingComponents)) {
      return chalk.underline.red('no components untracked');
    }
    if (!R.isEmpty(untrackedComponents)) {
      const title = chalk.underline('untracked components:\n');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      msg.push(title + untrackedComponents.map((result) => chalk.green(result)).join('\n'));
    }
    if (!R.isEmpty(unRemovableComponents)) {
      msg.push(
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        chalk.red(`error: unable to untrack ${unRemovableComponents.join(', ')}, please use the bit remove command.\n`)
      );
    }
    if (!R.isEmpty(missingComponents)) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      msg.push(chalk.red(`fatal: component ${missingComponents.join(', ')} did not match any component.`));
    }
    return msg.join('\n');
  }
}
