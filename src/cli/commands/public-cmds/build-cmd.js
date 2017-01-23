/** @flow */
import Command from '../../command';
import { buildInline } from '../../../api/consumer';
import { buildInScope } from '../../../api/scope';

const chalk = require('chalk');

export default class Build extends Command {
  name = 'build <id>';
  description = 'uses the compiler defined in the bit.json in order to return the compiled version of the component';
  alias = '';
  opts = [
    ['i', 'inline', 'create a compiled file on an inline bit (dist/dist.js)']
  ];
  
  action([id]: string[], { inline }: { inline: ?bool }): Promise<any> {
    function build() {
      if (inline) return buildInline(id);
      return buildInScope(id);
    }
    
    return build().then(res => ({
      res,
      inline,
    }));
  }

  report({ res, inline }: { res: ?string, inline: ?bool }): string {
    if (!res) return chalk.red('there is no compiler to that component');
    if (inline) { return chalk.cyan(res); }
    return res;
  }
}
