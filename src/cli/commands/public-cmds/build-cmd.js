/** @flow */
import Command from '../../command';
import { buildInline, buildInScope } from '../../../api/consumer';

const chalk = require('chalk');

export default class Build extends Command {
  name = 'build <id>';
  description = 'uses the compiler defined in the bit.json in order to return the compiled version of the component';
  alias = '';
  opts = [
    ['i', 'inline', 'create a compiled file on an inline bit (dist/dist.js)']
  ];
  
  action([id]: string[], { inline }: { inline: ?bool }): Promise<any> {
    if (inline) return buildInline(id);
    return buildInScope(id);
  }

  report(response): string {
    console.log(response);
    return chalk.bgBlack('-> finish build cmd');
  }
}
