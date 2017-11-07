/** @flow */
import Command from '../../command';
import { commitAction, commitAllAction } from '../../../api/consumer';
import Component from '../../../consumer/component';
import ModelComponent from '../../../scope/models/component';

const chalk = require('chalk');

export default class Export extends Command {
  name = 'tag [id]';
  description = 'record component changes and lock versions.';
  alias = 't';
  opts = [
    ['m', 'message <message>', 'message'],
    ['a', 'all', 'tag all new and modified components'],
    ['f', 'force', 'forcely tag even if tests are failing and even when component has not changed'],
    ['v', 'verbose', 'show specs output on tag'],
    ['', 'ignore_missing_dependencies', 'ignore missing dependencies (default = false)']
  ];
  loader = true;

  action(
    [id]: string[],
    {
      message,
      all,
      force,
      verbose,
      ignore_missing_dependencies = false
    }: { message: string, all: ?boolean, force: ?boolean, verbose: ?boolean, ignore_missing_dependencies: ?boolean }
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
      return commitAllAction({ message, force, verbose, ignoreMissingDependencies: ignore_missing_dependencies });
    }
    return commitAction({ id, message, force, verbose, ignoreMissingDependencies: ignore_missing_dependencies });
  }

  report(results): string {
    if (!results) return chalk.yellow('nothing to tag');
    const {
      components,
      autoUpdatedComponents
    }: { components: Component[], autoUpdatedComponents: ModelComponent[] } = results;
    function joinComponents(comps) {
      return comps
        .map((comp) => {
          if (comp instanceof ModelComponent) return comp.id();
          // Replace the @1 only if it ends with @1 to prevent id between 10-19 to shown wrong ->
          // myId@10 will be myId0 which is wrong
          return comp.id.toString().endsWith('@1') ? comp.id.toString().replace('@1', '') : comp.id.toString();
        })
        .join(', ');
    }

    function outputIfExists(comps, label, breakBefore) {
      if (comps.length !== 0) {
        let str = '';
        if (breakBefore) str = '\n';
        console.log('');
        str += `${chalk.cyan(label)} ${joinComponents(comps)}`;
        return str;
      }

      return '';
    }

    const changedComponents = components.filter(component => component.version > 1);
    const addedComponents = components.filter(component => component.version === 1);
    const autoUpdatedCount = autoUpdatedComponents ? autoUpdatedComponents.length : 0;

    return (
      chalk.green(`${components.length + autoUpdatedCount} components tagged`) +
      chalk.gray(
        ` | ${addedComponents.length} added, ${changedComponents.length} changed, ${autoUpdatedCount} auto-tagged\n`
      ) +
      outputIfExists(addedComponents, 'added components: ') +
      outputIfExists(changedComponents, 'changed components: ', true) +
      outputIfExists(
        autoUpdatedComponents,
        'auto-tagged components (as a result of tagging their dependencies): ',
        true
      )
    );
  }
}
