/** @flow */
import chalk from 'chalk';
import R from 'ramda';
import Command from '../command';
import { importAction } from '../../api';
import { immutableUnshift } from '../../utils';
import { formatBit, paintHeader } from '../chalk-box';

export default class Import extends Command {
  name = 'import [ids]';
  description = 'import a bit-component';
  alias = 'i';
  opts = [
    ['s', 'save', 'save into bit.json'],
    ['e', 'env', 'import an environment bit-component (compiler/tester)']
  ];

  action([id, ]: [string, ], { save, env }: any): Promise<any> {
    // @TODO - import should support multiple components
    return importAction({ bitId: id, save, env })
      .then(components => 
        components.map(component => ({
          scope: component.scope,
          box: component.box,
          name: component.name,
          version: component.version.toString()
        }))
      );
  }

  report(components: any): string {
    if (R.isEmpty(components)) { return 'done'; }
    return immutableUnshift(
      components.map(formatBit),
      paintHeader('imported the following bits:')
    ).join('\n');
  }
}
