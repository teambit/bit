/** @flow */
import Command from '../../command';
import { commitAction, commitAllAction } from '../../../api/consumer';
import Component from '../../../consumer/component';

const chalk = require('chalk');

export default class Export extends Command {
  name = 'tag [id]';
  description = 'record component changes and lock versions.';
  alias = 't';
  opts = [
    ['m', 'message <message>', 'message'],
    ['a', 'all', 'tag all new and modified components'],
    ['f', 'force', 'forcely tag even if tests are failing and even when component has not changed'],
    ['v', 'verbose', 'show specs output on tag']
  ];
  loader = true;

  action(
    [id]: string[],
    { message, all, force, verbose }: { message: string, all: ?boolean, force: ?boolean, verbose: ?boolean }
  ): Promise<any> {
    if (!id && !all) {
      return Promise.reject('missing [id]. to tag all components, please use --all flag');
    }
    if (id && all) {
      return Promise.reject(
        'you can use either a specific component [id] to tag a particular component or --all flag to tag them all'
      );
    }
    if (!message) {
      // todo: get rid of this. Make it required by commander
      return Promise.reject('missing [message], please use -m to write the log message');
    }
    if (all) {
      return commitAllAction({ message, force, verbose });
    }
    return commitAction({ id, message, force, verbose });
  }

  report(components: Component | Component[]): string {
    if (!components) return chalk.yellow('nothing to tag');
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

    return (
      chalk.green(`${components.length} components tagged`) +
      chalk.gray(` | ${addedComponents.length} added, ${changedComponents.length} changed\n`) +
      outputIfExists(addedComponents, 'added components: ') +
      outputIfExists(changedComponents, 'changed components: ', true)
    );
  }
}
