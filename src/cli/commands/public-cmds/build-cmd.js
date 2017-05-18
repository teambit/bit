/** @flow */
import Command from '../../command';
import { buildInline, buildInlineAll } from '../../../api/consumer';
import { buildInScope } from '../../../api/scope';

const chalk = require('chalk');

export default class Build extends Command {
  name = 'build [id]';
  description = 'uses the compiler defined in the bit.json in order to return the compiled version of the component';
  alias = '';
  opts = [
    ['i', 'inline', 'create a compiled file on an inline component (dist/<implFile>)'],
    ['e', 'environment', 'also pre install the required environment bit before running the build'],
    ['s', 'save', 'for running build and save the results in the model'],
    ['v', 'verbose', 'showing npm verbose output for inspection'],
  ];

  action([id]: string[], { inline, save, environment, verbose }: {
    inline: ?bool,
    save: ?bool,
    environment: ?bool,
    verbose: ?bool,
  }): Promise<any> {
    function build() {
      if (!id) return buildInlineAll();
      if (inline) return buildInline(id);
      return buildInScope({ id, environment, save, verbose });
    }

    return build()
    .then(res => ({
      res,
      inline,
    }));
  }

  report({ res, inline }: { res: ?string[]|string|Object, inline: ?bool }): string {
    const noCompilerSpecifiedError = chalk.red('there is no compiler to that component');
    if (!res) return noCompilerSpecifiedError;
    if (inline && Array.isArray(res)) { return chalk.cyan(res.join('\n')); }
    if (inline && typeof res === 'object') { // got from build-all-inline
      // $FlowFixMe - res is an object
      return Object.keys(res).map((component) => {
        const title = chalk.bold(component);
        // $FlowFixMe - res is an object
        const content = Array.isArray(res[component]) ?
          chalk.cyan(res[component].join('\n')) : noCompilerSpecifiedError;
        return `${title}\n${content}\n`;
      }).join('\n');
    }
    // $FlowFixMe - res is a string
    return res;
  }
}
