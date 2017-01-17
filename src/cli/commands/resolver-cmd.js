/** @flow */
import chalk from 'chalk';
import Command from '../command';
import { getResolver, setResolver, resetResolver } from '../../api';

class ResolverSet extends Command {
  name = 'set <resolverPath>';
  description = 'set remote resolver to scope (use from scope directory)';
  alias = 's';
  opts = [];
  
  action([resolverPath, ]: [string, ]): Promise<any> {
    if (!resolverPath) {
      // @TODO mandatory arguments do not work for sub commands - please fix !
      throw new Error('resolverPath is mandatory');
    }

    return setResolver(process.cwd(), resolverPath)
    .then(() => resolverPath);
  }

  report(resolverPath): string {
    return `resovler path has changed sucessfully to - ${chalk.yellow(resolverPath)}`;
  }
}

class ResolverReset extends Command {
  name = 'reset';
  description = 'reset remote resolver to default resolver';
  alias = 'r';
  opts = [];
  
  action(): Promise<any> {
    return resetResolver(process.cwd());
  }

  report(): string {
    return 'resovler path has successfully reset to deafult';
  }
}

export default class Resolver extends Command {
  name = 'resolver';
  description = 'get or set remote resolver to scope';
  alias = '';
  opts = [];
  commands = [
    new ResolverSet(),
    new ResolverReset()
  ];
  
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
