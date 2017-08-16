/** @flow */
import Command from '../../command';
import { commitAction, commitAllAction } from '../../../api/consumer';
import Component from '../../../consumer/component';

const chalk = require('chalk');

export default class Export extends Command {
  name = 'commit [id]';
  description = 'record component changes and lock versions.';
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

  report(components: Component|Component[]): string {
    if (!components) return chalk.yellow('nothing to commit');
    if (!Array.isArray(components)) components = [components];
    
    function joinComponents(comps) {
      return comps.map(comp => comp.id.toString().replace('@1', '')).join(', ');
    }

    function outputIfExists(comps, label, breakBefore) {
      if (comps.length !== 0) {
        let str = '';
        if (breakBefore) str = '\n';
        str += `${chalk.cyan(label)} ${joinComponents(comps)}`;
        return str;
      }

      return '';
    }

    const changedComponents = components.filter(component => component.version > 1);
    const addedComponents = components.filter(component => component.version === 1);

    return chalk.green(`${components.length} components committed`) + chalk.gray(` | ${addedComponents.length} added, ${changedComponents.length} changed\n`)
      + outputIfExists(addedComponents, 'added components: ')
      + outputIfExists(changedComponents, 'changed components: ', true);
  }
}
