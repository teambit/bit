/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { status } from '../../../api/consumer';
import { immutableUnshift } from '../../../utils';
import { formatBitString, formatNewBit } from '../../chalk-box';
import missingDepsTemplate from '../../templates/missing-dependencies-template';


export default class Status extends Command {
  name = 'status';
  description = 'show modifications status';
  alias = 's';
  opts = [];

  action(): Promise<Object> {
    return status();
  }

  report({ newComponents, modifiedComponent, stagedComponents, componentsWithMissingDeps }: Object): string {
    const newComponentsOutput = immutableUnshift(
      newComponents.map(formatNewBit),
      newComponents.length ? chalk.underline.white('New Components') : chalk.green('There are no new components')
    ).join('\n');

    const modifiedComponentOutput = immutableUnshift(
      modifiedComponent.map(formatNewBit),
      modifiedComponent.length ? chalk.underline.white('Modified Components') : chalk.green('There are no modified components')
    ).join('\n');

    const stagedComponentsOutput = immutableUnshift(
      stagedComponents.map(formatBitString),
      stagedComponents.length ? chalk.underline.white('Staged Components') : chalk.green('There are no staged components')
    ).join('\n');

    const componentsWithMissingDepsOutput = missingDepsTemplate(componentsWithMissingDeps);

    return [newComponentsOutput, modifiedComponentOutput, stagedComponentsOutput, componentsWithMissingDepsOutput].join(
      chalk.underline('\n                         \n')
    + chalk.white('\n'));
  }
}
