/** @flow */
import chalk from 'chalk';
import R from 'ramda';
import Command from '../command';
import { importAction } from '../../api';
import { immutableUnshift } from '../../utils';
import { formatBit, paintHeader } from '../chalk-box';

export default class Import extends Command {
  name = 'import [ids]';
  description = 'import a bit';
  alias = 'i';
  opts = [
    ['s', 'save', 'save into bit.json'],
    ['e', 'env', 'import an environment bit (compiler/tester)']
  ];

  action([id, ]: [string, ], { save, env }: any): Promise<any> {
    // @TODO - import should support multiple bits
    return importAction({ bitId: id, save, env })
      .then(bits => 
        bits.map(bit => ({
          scope: bit.scope,
          box: bit.getBox(),
          name: bit.getName(),
          version: bit.getVersion()
        }))
      );
  }

  report(bits: any): string {
    if (R.isEmpty(bits)) { return 'done'; }
    return immutableUnshift(
      bits.map(formatBit),
      paintHeader('imported the following bits:')
    ).join('\n');
  }
}
