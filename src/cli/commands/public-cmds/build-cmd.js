/** @flow */
import Command from '../../command';
import { build, buildAll } from '../../../api/consumer';
import { empty } from '../../../utils';

const chalk = require('chalk');

export default class Build extends Command {
  name = 'build [id]';
  description = 'build any set of components with configured compiler (component compiler or as defined in bit.json)';
  alias = '';
  // TODO: Need to send parameters (non of them are used)
  opts = [
    ['e', 'environment', 'also pre install the required environment bit before running the build'],
    ['s', 'save', 'for running build and save the results in the model'],
    ['v', 'verbose', 'showing npm verbose output for inspection']
  ];
  loader = true;
  migration = true;

  action(
    [id]: string[],
    {
      save,
      environment,
      verbose
    }: {
      save: ?boolean,
      environment: ?boolean,
      verbose: ?boolean
    }
  ): Promise<any> {
    if (!id) return buildAll();
    return build(id);
  }

  report(res: ?(string[]) | string | Object): string {
    const noCompilerSpecifiedError = chalk.red('compiler is not defined, please define a compiler in bit.json');
    if (!res) return noCompilerSpecifiedError;
    if (Array.isArray(res)) {
      return chalk.cyan(res.join('\n'));
    }
    if (typeof res === 'object') {
      // got from build-all
      // $FlowFixMe - res is an object
      if (empty(res)) return chalk.yellow('nothing to build');
      return Object.keys(res)
        .map((component) => {
          const title = chalk.bold(component);
          // $FlowFixMe - res is an object
          const content = Array.isArray(res[component])
            ? chalk.cyan(res[component].join('\n'))
            : noCompilerSpecifiedError;
          return `${title}\n${content}\n`;
        })
        .join('\n');
    }
    // $FlowFixMe - res is a string
    return res;
  }
}
