/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { status } from '../../../api/consumer';
import { immutableUnshift } from '../../../utils';
import { formatBit, formatInlineBit } from '../../chalk-box';

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
    const getBitStatusForInline = bit => ({
      name: bit.name,
      box: bit.box,
      // valid: bit.validate(),
      // version: bit.version
    });

    const getBitStatusForSources = bit => ({
      name: bit.name,
      box: bit.box,
      // valid: bit.validate(),
      version: bit.version
    });

    return status()
    .then(({ inline, sources }) => {
      return ({
        inline: inline.map(getBitStatusForInline),
        sources: sources.map(getBitStatusForSources)
      });
    });
  }

  report({ inline, sources }: { inline: StatusObj[], sources: StatusObj[] }): string {
    const inlineBits = immutableUnshift(
      inline.map(formatInlineBit),
      inline.length ? chalk.underline.white('inline components') : chalk.green('your inline_component directory is empty')
    ).join('\n');

    const sourcesBits = immutableUnshift(
      sources.map(formatBit),
      sources.length ? chalk.underline.white('sources waiting for export') : chalk.green('you don\'t have any sources to export')
    ).join('\n');

    return [inlineBits, sourcesBits].join(
      chalk.underline('\n                         \n')
    + chalk.white('\n'));
  }
}
