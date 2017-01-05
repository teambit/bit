/** @flow */
import chalk from 'chalk';
import Command from '../command';
import { status } from '../../api';
import { immutableUnshift } from '../../utils';
import { formatBit, formatInlineBit } from '../chalk-box';

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
    const getBitStatus = bit => ({
      name: bit.name,
      box: bit.getBox(),
      valid: bit.validate(),
      version: bit.getVersion()
    });

    return status()
    .then(({ inline, sources }) => ({
      inline: inline.map(getBitStatus),
      sources: sources.map(getBitStatus)
    }));
  }

  report({ inline, sources }: { inline: StatusObj[], sources: StatusObj[] }): string {
    const inlineBits = immutableUnshift(
      inline.map(formatInlineBit),
      inline.length ? chalk.underline.white('inline bit components') : chalk.green('your inline_bits directory is empty')
    ).join('\n');
    
    const sourcesBits = immutableUnshift(
      sources.map(formatBit),
      sources.length ? chalk.underline.white('sources to push') : chalk.green('you don\'t have any sources to push')
    ).join('\n');
      
    return [inlineBits, sourcesBits].join(
      chalk.underline('\n                         \n') 
    + chalk.white('\n'));
  }
}
