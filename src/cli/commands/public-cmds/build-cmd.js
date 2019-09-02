/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { build, buildAll } from '../../../api/consumer';
import { empty } from '../../../utils';
import { BASE_DOCS_DOMAIN } from '../../../constants';

export default class Build extends Command {
  name = 'build [id]';
  description = `build any set of components with a configured compiler (as defined in bit.json)\n  https://${BASE_DOCS_DOMAIN}/docs/building-components.html`;
  alias = '';
  opts = [
    ['v', 'verbose [boolean]', 'showing npm verbose output for inspection'],
    ['c', 'no-cache', 'ignore component cache when creating dist file']
  ];
  loader = true;
  migration = true;

  action(
    [id]: string[],
    {
      noCache = false,
      verbose = false
    }: {
      noCache: boolean,
      verbose: boolean
    }
  ): Promise<any> {
    if (!id) return buildAll(noCache, verbose);
    return build(id, noCache, verbose);
  }

  report(res: ?(string[]) | string | Object): string {
    const noCompilerSpecifiedError = chalk.yellow('compiler is not defined, please define a compiler in bit.json');
    if (!res) return noCompilerSpecifiedError;
    if (Array.isArray(res)) {
      return chalk.cyan(res.join('\n'));
    }
    if (typeof res === 'object') {
      // got from build-all
      // $FlowFixMe - res is an object
      if (empty(res)) {
        return chalk.yellow(`nothing to build
learn how to set a build step for components - https://${BASE_DOCS_DOMAIN}/docs/building-components.html`);
      }
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
