/** @flow */
import semver from 'semver';
import Command from '../../command';
import { commitAction, commitAllAction } from '../../../api/consumer';
import Component from '../../../consumer/component';
import ModelComponent from '../../../scope/models/component';
import { DEFAULT_BIT_VERSION, DEFAULT_BIT_RELEASE_TYPE } from '../../../constants';

const chalk = require('chalk');

export default class Export extends Command {
  name = 'tag [id]';
  description = 'record component changes and lock versions.';
  alias = 't';
  opts = [
    ['m', 'message <message>', 'message'],
    ['a', 'all', 'tag all new and modified components'],
    ['', 'exact_version <exact_version>', 'exact version to tag'],
    ['', 'patch', 'increment the patch version number'],
    ['', 'minor', 'increment the minor version number'],
    ['', 'major', 'increment the major version number'],
    ['f', 'force', 'forcely tag even if tests are failing and even when component has not changed'],
    ['v', 'verbose', 'show specs output on tag'],
    ['', 'ignore_missing_dependencies', 'ignore missing dependencies (default = false)'],
    ['s', 'scope', 'tag all components of the current scope'],
    ['', 'include_imported', 'when "scope" flag is used, tag also imported components']
  ];
  loader = true;
  migration = true;

  action(
    [id]: string[],
    {
      message,
      all,
      exact_version,
      patch,
      minor,
      major,
      force,
      verbose,
      ignore_missing_dependencies = false,
      scope = false,
      include_imported = false
    }: {
      message: string,
      all: ?boolean,
      exact_version: ?string,
      patch: ?boolean,
      minor: ?boolean,
      major: ?boolean,
      force: ?boolean,
      verbose: ?boolean,
      ignore_missing_dependencies: ?boolean,
      scope: ?boolean,
      include_imported: ?boolean
    }
  ): Promise<any> {
    if (!id && !all) {
      return Promise.reject('missing [id]. to tag all components, please use --all flag');
    }
    if (id && all) {
      return Promise.reject(
        'you can use either a specific component [id] to tag a particular component or --all flag to tag them all'
      );
    }
    if (scope && !exact_version) {
      return Promise.reject(
        'tagging the entire scope (--scope), requires specifying an exact-version (--exact-version)'
      );
    }
    if (include_imported && !scope) {
      return Promise.reject("--include_imported flag can't be in use without --scope flag");
    }

    const releaseFlags = [patch, minor, major].filter(x => x);
    if (releaseFlags.length > 1) {
      return Promise.reject('you can use only one of the following - patch, minor, major');
    }

    // const releaseType = major ? 'major' : (minor ? 'minor' : (patch ? 'patch' : DEFAULT_BIT_RELEASE_TYPE));
    let releaseType = DEFAULT_BIT_RELEASE_TYPE;
    if (major) releaseType = 'major';
    else if (minor) releaseType = 'minor';
    else if (patch) releaseType = 'patch';

    if (!message) {
      // todo: get rid of this. Make it required by commander
      return Promise.reject('missing [message], please use -m to write the log message');
    }
    if (all) {
      return commitAllAction({
        message,
        exactVersion: exact_version,
        releaseType,
        force,
        verbose,
        ignoreMissingDependencies: ignore_missing_dependencies,
        scope,
        includeImported: include_imported
      });
    }
    return commitAction({
      id,
      message,
      exactVersion: exact_version,
      releaseType,
      force,
      verbose,
      ignoreMissingDependencies: ignore_missing_dependencies
    });
  }

  report(results): string {
    if (!results) return chalk.yellow('nothing to tag');
    const {
      components,
      autoUpdatedComponents,
      warnings
    }: { components: Component[], autoUpdatedComponents: ModelComponent[], warnings: string[] } = results;
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

    const changedComponents = components.filter(component => semver.gt(component.version, DEFAULT_BIT_VERSION));
    const addedComponents = components.filter(component => semver.eq(component.version, DEFAULT_BIT_VERSION));
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
