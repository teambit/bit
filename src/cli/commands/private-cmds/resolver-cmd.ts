/**
 * this command is not in-use currently. consider deleting it.
 */

/* eslint max-classes-per-file: 0 */

import chalk from 'chalk';

import { getResolver, resetResolver, setResolver } from '../../../api/scope/lib/resolver';
import { LegacyCommand } from '../../legacy-command';

class ResolverSet implements LegacyCommand {
  name = 'set <resolverPath>';
  description = 'set remote resolver to scope (use from scope directory)';
  alias = 's';
  private = true;
  loader = false;
  opts = [];

  action([resolverPath]: [string]): Promise<any> {
    if (!resolverPath) {
      // @TODO mandatory arguments do not work for sub commands - please fix !
      throw new Error('resolverPath is mandatory');
    }

    return setResolver(process.cwd(), resolverPath).then(() => resolverPath);
  }

  report(resolverPath): string {
    return `resolver path has changed successfully to - ${chalk.yellow(resolverPath)}`;
  }
}

class ResolverReset implements LegacyCommand {
  name = 'reset';
  description = 'reset remote resolver to default resolver';
  alias = 'r';
  opts = [];

  action(): Promise<any> {
    return resetResolver(process.cwd());
  }

  report(): string {
    return 'resovler path has successfully reset to default';
  }
}

export default class Resolver implements LegacyCommand {
  name = 'resolver';
  description = 'get or set remote resolver to scope';
  alias = '';
  opts = [];
  commands = [new ResolverSet(), new ResolverReset()];
  private = true;

  action(): Promise<any> {
    return getResolver(process.cwd());
  }

  report(resovlerPath: string): string {
    if (!resovlerPath) {
      return 'there is no resolver path, bit uses the default resolver';
    }

    return chalk.yellow(resovlerPath);
  }
}
