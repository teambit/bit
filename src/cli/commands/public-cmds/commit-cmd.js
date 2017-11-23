/** @flow */
import semver from 'semver';
import Command from '../../command';
import { commitAction, commitAllAction } from '../../../api/consumer';
import Component from '../../../consumer/component';
import { isString } from '../../../utils';
import ModelComponent from '../../../scope/models/component';
import { DEFAULT_BIT_VERSION, DEFAULT_BIT_RELEASE_TYPE } from '../../../constants';

const chalk = require('chalk');

export default class Export extends Command {
  name = 'tag [id] [version]';
  description = 'record component changes and lock versions.';
  alias = 't';
  opts = [
    ['m', 'message <message>', 'log message describing the user changes'],
    ['a', 'all [version]', 'tag all new and modified components'],
    ['s', 'scope <version>', 'tag all components of the current scope'],
    ['p', 'patch', 'increment the patch version number'],
    ['mi', 'minor', 'increment the minor version number'],
    ['ma', 'major', 'increment the major version number'],
    ['f', 'force', 'forcely tag even if tests are failing and even when component has not changed'],
    ['v', 'verbose', 'show specs output on tag'],
    ['i', 'ignore-missing-dependencies', 'ignore missing dependencies (default = false)']
  ];
  loader = true;
  migration = true;

  action(
    [id]: string[],
    {
      message,
      all,
      patch,
      minor,
      major,
      version,
      force,
      verbose,
      ignoreMissingDependencies = false,
      scope = false
    }: {
      message: string,
      all: ?boolean,
      patch: ?boolean,
      minor: ?boolean,
      major: ?boolean,
      force: ?boolean,
      version: ?string,
      verbose: ?boolean,
      ignoreMissingDependencies: ?boolean,
      scope: ?boolean
    }
  ): Promise<any> {
    function getVersion() {
      if (all && isString(all)) return all;
      if (scope) return scope;
      return version;
    }

    if (!id && !all) {
      return Promise.reject('missing [id]. to tag all components, please use --all flag');
    }
    if (id && all) {
      return Promise.reject(
        'you can use either a specific component [id] to tag a particular component or --all flag to tag them all'
      );
    }

    const releaseFlags = [patch, minor, major].filter(x => x);
    if (releaseFlags.length > 1) {
      return Promise.reject('you can use only one of the following - patch, minor, major');
    }

    // const releaseType = major ? 'major' : (minor ? 'minor' : (patch ? 'patch' : DEFAULT_BIT_RELEASE_TYPE));
    let releaseType = DEFAULT_BIT_RELEASE_TYPE;
    const includeImported = scope && all;

    if (major) releaseType = 'major';
    else if (minor) releaseType = 'minor';
    else if (patch) releaseType = 'patch';

    if (all) {
      return commitAllAction({
        message: message || '',
        exactVersion: getVersion(),
        releaseType,
        force,
        verbose,
        ignoreMissingDependencies,
        scope,
        includeImported
      });
    }
    return commitAction({
      id,
      message,
      exactVersion: getVersion(),
      releaseType,
      force,
      verbose,
      ignoreMissingDependencies
    });
  }

  report(results): string {
    if (!results) return chalk.yellow('nothing to tag');
    const {
      components,
      autoUpdatedComponents,
      warnings,
      newComponents
    }: {
      components: Component[],
      autoUpdatedComponents: ModelComponent[],
      warnings: string[],
      newComponents: string[]
    } = results;
    function joinComponents(comps) {
      return comps
        .map((comp) => {
          if (comp instanceof ModelComponent) return comp.id();
          // Replace the @1 only if it ends with @1 to prevent id between 10-19 to shown wrong ->
          // myId@10 will be myId0 which is wrong
          return comp.id.toString().endsWith(DEFAULT_BIT_VERSION)
            ? comp.id.toString().replace(`@${DEFAULT_BIT_VERSION}`, '')
            : comp.id.toString();
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

    // send only non new components to changed components compare
    const changedComponents = components.filter(
      component => !newComponents.includes(component.id.toStringWithoutVersion())
    );
    const addedComponents = components.filter(component =>
      newComponents.includes(component.id.toStringWithoutVersion())
    );
    const autoUpdatedCount = autoUpdatedComponents ? autoUpdatedComponents.length : 0;

    const warningsOutput = warnings && warnings.length ? `${chalk.yellow(warnings.join('\n'))}\n\n` : '';

    return (
      warningsOutput +
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
