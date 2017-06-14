/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { status } from '../../../api/consumer';
import { immutableUnshift } from '../../../utils';
import { formatBit, formatInlineBit, formatBitString } from '../../chalk-box';

type StatusObj = {
  name: string,
  box: string,
  valid: boolean
};

export default class Status extends Command {
  name = 'status';
  description = 'show modifications status';
  alias = 's';
  opts = [];

  action(): Promise<{ inline: StatusObj[], source: StatusObj[] }> {
    return status();
  }

  report({ untrackedComponents, newComponents, modifiedComponent, stagedComponents }
  : { inline: StatusObj[], sources: StatusObj[] }): string {
    const untrackedComponentsOutput = immutableUnshift(
      untrackedComponents.map(formatBitString),
      untrackedComponents.length ? chalk.underline.white('Untracked Components') : chalk.green('There are no untracked components')
    ).join('\n');

    const newComponentsOutput = immutableUnshift(
      newComponents.map(formatBitString),
      newComponents.length ? chalk.underline.white('New Components') : chalk.green('There are no new components')
    ).join('\n');

    const modifiedComponentOutput = immutableUnshift(
      modifiedComponent.map(formatBitString),
      modifiedComponent.length ? chalk.underline.white('Modified Components') : chalk.green('There are no modified components')
    ).join('\n');

    const stagedComponentsOutput = immutableUnshift(
      stagedComponents.map(formatBitString),
      stagedComponents.length ? chalk.underline.white('Staged Components') : chalk.green('There are no staged components')
    ).join('\n');

    return [untrackedComponentsOutput, newComponentsOutput, modifiedComponentOutput, stagedComponentsOutput].join(
      chalk.underline('\n                         \n')
    + chalk.white('\n'));
  }
}
