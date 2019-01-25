/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { tagAction, tagAllAction } from '../../../api/consumer';
import type { TagResults } from '../../../api/consumer/lib/tag';
import { isString } from '../../../utils';
import ModelComponent from '../../../scope/models/model-component';
import { DEFAULT_BIT_RELEASE_TYPE, BASE_DOCS_DOMAIN } from '../../../constants';
import GeneralError from '../../../error/general-error';
import hasWildcard from '../../../utils/string/has-wildcard';

export const NOTHING_TO_TAG_MSG = 'nothing to tag';

export default class Tag extends Command {
  name = 'tag [id] [version]';
  description = `record component changes and lock versions.
  https://${BASE_DOCS_DOMAIN}/docs/versioning-tracked-components.html
  the id can be used with wildcards (e.g. bit tag "utils/*")`;
  alias = 't';
  opts = [
    ['m', 'message <message>', 'log message describing the user changes'],
    ['a', 'all [version]', 'tag all new and modified components'],
    ['s', 'scope <version>', 'tag all components of the current scope'],
    ['p', 'patch', 'increment the patch version number'],
    ['mi', 'minor', 'increment the minor version number'],
    ['ma', 'major', 'increment the major version number'],
    ['f', 'force', 'force-tag even if tests are failing and even when component has not changed'],
    ['v', 'verbose', 'show specs output on failure'],
    ['', 'ignore-missing-dependencies', 'DEPRECATED. use --ignore-unresolved-dependencies instead'],
    ['i', 'ignore-unresolved-dependencies', 'ignore missing dependencies (default = false)'],
    ['I', 'ignore-newest-version', 'ignore existing of newer versions (default = false)'],
    ['', 'skip-tests', 'skip running component tests during tag process']
  ];
  loader = true;
  migration = true;

  action(
    [id, version]: string[],
    {
      message,
      all,
      patch,
      minor,
      major,
      force,
      verbose,
      ignoreMissingDependencies = false,
      ignoreUnresolvedDependencies = false,
      ignoreNewestVersion = false,
      skipTests = false,
      scope
    }: {
      message: string,
      all: ?boolean,
      patch: ?boolean,
      minor: ?boolean,
      major: ?boolean,
      force: ?boolean,
      verbose: ?boolean,
      ignoreMissingDependencies?: boolean,
      ignoreUnresolvedDependencies?: boolean,
      ignoreNewestVersion?: boolean,
      skipTests?: boolean,
      scope: ?string
    }
  ): Promise<any> {
    function getVersion() {
      if (scope) return scope;
      if (all && isString(all)) return all;
      return version;
    }

    if (!id && !all && !scope) {
      throw new GeneralError('missing [id]. to tag all components, please use --all flag');
    }
    if (id && all) {
      throw new GeneralError(
        'you can use either a specific component [id] to tag a particular component or --all flag to tag them all'
      );
    }

    const releaseFlags = [patch, minor, major].filter(x => x);
    if (releaseFlags.length > 1) {
      throw new GeneralError('you can use only one of the following - patch, minor, major');
    }

    // const releaseType = major ? 'major' : (minor ? 'minor' : (patch ? 'patch' : DEFAULT_BIT_RELEASE_TYPE));
    let releaseType = DEFAULT_BIT_RELEASE_TYPE;
    const includeImported = scope && all;

    if (major) releaseType = 'major';
    else if (minor) releaseType = 'minor';
    else if (patch) releaseType = 'patch';

    if (ignoreMissingDependencies) ignoreUnresolvedDependencies = true;

    const idHasWildcard = hasWildcard(id);

    if (all || scope || idHasWildcard) {
      return tagAllAction({
        message: message || '',
        exactVersion: getVersion(),
        releaseType,
        force,
        verbose,
        ignoreUnresolvedDependencies,
        ignoreNewestVersion,
        skipTests,
        scope,
        includeImported,
        idWithWildcard: id
      });
    }
    return tagAction({
      id,
      message,
      exactVersion: getVersion(),
      releaseType,
      force,
      verbose,
      ignoreUnresolvedDependencies,
      ignoreNewestVersion,
      skipTests
    });
  }

  report(results: TagResults): string {
    if (!results) return chalk.yellow(NOTHING_TO_TAG_MSG);
    const { taggedComponents, autoTaggedComponents, warnings, newComponents }: TagResults = results;
    function joinComponents(comps) {
      return comps
        .map((comp) => {
          if (comp instanceof ModelComponent) {
            const bitId = comp.toBitId();
            return bitId.changeVersion(comp.latest()).toString();
          }
          return comp.id.toString();
        })
        .join(', ');
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

    // send only non new components to changed components compare
    const changedComponents = taggedComponents.filter(component => !newComponents.searchWithoutVersion(component.id));
    const addedComponents = taggedComponents.filter(component => newComponents.searchWithoutVersion(component.id));
    const autoTaggedCount = autoTaggedComponents ? autoTaggedComponents.length : 0;

    const warningsOutput = warnings && warnings.length ? `${chalk.yellow(warnings.join('\n'))}\n\n` : '';

    return (
      warningsOutput +
      chalk.green(`${taggedComponents.length + autoTaggedCount} components tagged`) +
      chalk.gray(
        ` | ${addedComponents.length} added, ${changedComponents.length} changed, ${autoTaggedCount} auto-tagged`
      ) +
      outputIfExists(addedComponents, 'added components: ', true) +
      outputIfExists(changedComponents, 'changed components: ', true) +
      outputIfExists(autoTaggedComponents, 'auto-tagged components (as a result of tagging their dependencies): ', true)
    );
  }
}
