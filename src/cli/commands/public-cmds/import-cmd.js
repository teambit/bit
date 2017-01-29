/** @flow */
import R from 'ramda';
import Command from '../../command';
import { importAction } from '../../../api/consumer';
import { immutableUnshift } from '../../../utils';
import { formatBit, paintHeader } from '../../chalk-box';

export default class Import extends Command {
  name = 'import [ids]';
  description = 'import a bit-component';
  alias = 'i';
  opts = [
    ['s', 'save', 'save into bit.json'],
    ['t', 'tester', 'import a tester environment bit-component'],
    ['c', 'compiler', 'import a compiler environment bit-component']
  ];
  loader = { text: 'Exporting component' };

  action([id, ]: [string, ], { save, tester, compiler }: any): Promise<any> {
    // @TODO - import should support multiple components
    if (tester && compiler) {
      throw new Error('you cant use tester and compiler flags combined');
    }
    
    return importAction({ bitId: id, save, tester, compiler })
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
