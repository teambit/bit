/** @flow */
import Command from '../../command';
import { commitAction, commitAllAction } from '../../../api/consumer';
import Component from '../../../consumer/component';

const chalk = require('chalk');

export default class Export extends Command {
  name = 'commit [id]';
  description = 'commit a component to the local scope and add a log message';
  alias = 'c';
  opts = [
    ['m', 'message <message>', 'commit message'],
    ['a', 'all', 'commit all new and modified components'],
    ['f', 'force', 'forcely commit even if specs fails'],
    ['v', 'verbose', 'show specs output on commit'],
  ];
  loader = true;

  action([id]: string[], { message, all, force, verbose }:
  { message: string, all: ?bool, force: ?bool, verbose: ?bool }): Promise<any> {
    if (!id && !all) {
      return Promise.reject('Missing [id]. To commit all components, please use --all flag');
    }
    if (id && all) {
      return Promise.reject('You can use either [id] to commit a particular component or --all flag to commit them all');
    }
    if (!message) {  // todo: get rid of this. Make it required by commander
      return Promise.reject('Missing [message], use -m to write the log message');
    }
    if (all) {
      return commitAllAction({ message, force, verbose });
    }
    return commitAction({ id, message, force, verbose });
  }

  report(c: Component|Component[]): string {
    const output = (component) => {
      const componentName = `${component.box}/${component.name}`;
      return chalk.green(`component ${chalk.bold(componentName)} committed successfully`);
    };

    if (Array.isArray(c)) {
      return c.map(oneComponent => output(oneComponent)).join('\n');
    }

    if (!c) {
      return chalk.green(`There is nothing to commit`);
    }

    return output(c);
  }
}
