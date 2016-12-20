/** @flow */
import chalk from 'chalk';
import Command from '../command';
import { importAction } from '../../api';
import { immutableUnshift } from '../../utils';
import { formatBit } from '../chalk-box';

export default class Import extends Command {
  name = 'import [ids]';
  description = 'import a bit';
  alias = 'i';
  opts = [
    ['S', 'save', 'save into bit.json']
  ];

  action([id, ]: [string, ]): Promise<any> {
    // @TODO - import should support multiple bits
    return importAction({ bitId: id })
      .then(bits => 
        bits.map(bit => ({
          scope: bit.scope,
          box: bit.getBox(),
          name: bit.getName()
        }))
      );
  }

  report(bits: Array<{ scope: string, box: string, name: string }>): string {
    return immutableUnshift(
      bits.map(formatBit),
      chalk.underline.white('imported the following bits:')
    ).join('\n');
  }
}
