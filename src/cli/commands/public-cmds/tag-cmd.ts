import chalk from 'chalk';
import { ReleaseType } from 'semver';
import { LegacyCommand, CommandOptions } from '../../legacy-command';
import { tagAction, tagAllAction } from '../../../api/consumer';
import { TagResults } from '../../../api/consumer/lib/tag';
import { isString } from '../../../utils';
import { DEFAULT_BIT_RELEASE_TYPE, BASE_DOCS_DOMAIN, WILDCARD_HELP } from '../../../constants';
import GeneralError from '../../../error/general-error';
import hasWildcard from '../../../utils/string/has-wildcard';

export const NOTHING_TO_TAG_MSG = 'nothing to tag';
export const AUTO_TAGGED_MSG = 'auto-tagged dependents';

export default class Tag implements LegacyCommand {
  name = 'tag [id] [version]';
  description = `record component changes and lock versions.
  https://${BASE_DOCS_DOMAIN}/docs/tag-component-version
  ${WILDCARD_HELP('tag')}`;
  alias = 't';
  opts = [
    ['m', 'message <message>', 'log message describing the user changes'],
    ['a', 'all [version]', 'tag all new and modified components'],
    ['s', 'scope <version>', 'tag all components of the current scope'],
    ['p', 'patch', 'increment the patch version number'],
    ['', 'minor', 'increment the minor version number'],
    ['', 'major', 'increment the major version number'],
    ['f', 'force', 'force-tag even if tests are failing and even when component has not changed'],
    ['v', 'verbose', 'show specs output on failure'],
    ['', 'ignore-missing-dependencies', 'DEPRECATED. use --ignore-unresolved-dependencies instead'],
    ['i', 'ignore-unresolved-dependencies', 'ignore missing dependencies (default = false)'],
    ['I', 'ignore-newest-version', 'ignore existing of newer versions (default = false)'],
    ['', 'allow-relative-paths', 'allow require statements between components to use relative paths (not recommended)'],
    ['', 'allow-files', 'allow component to have files spread over multiple directories (not recommended)'],
    ['', 'skip-tests', 'skip running component tests during tag process'],
    ['', 'skip-auto-tag', 'EXPERIMENTAL. skip auto tagging dependents']
  ] as CommandOptions;
  loader = true;
  migration = true;
  remoteOp = true; // In case a compiler / tester is not installed

  action(
    [id, version]: string[],
    {
      message = '',
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
      skipAutoTag = false,
      scope
    }: {
      message?: string;
      all?: boolean;
      patch?: boolean;
      minor?: boolean;
      major?: boolean;
      force?: boolean;
      verbose?: boolean;
      ignoreMissingDependencies?: boolean;
      ignoreUnresolvedDependencies?: boolean;
      ignoreNewestVersion?: boolean;
      skipTests?: boolean;
      skipAutoTag?: boolean;
      scope?: string;
    }
  ): Promise<any> {
    function getVersion(): string | undefined {
      if (scope) return scope;
      if (all && isString(all)) return all;
      return version;
    }

    if (!id && !all && !scope) {
      throw new GeneralError('missing id. to tag all components, please use --all flag');
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

    let releaseType: ReleaseType = DEFAULT_BIT_RELEASE_TYPE;
    const includeImported = scope && all;

    if (major) releaseType = 'major';
    else if (minor) releaseType = 'minor';
    else if (patch) releaseType = 'patch';

    if (ignoreMissingDependencies) ignoreUnresolvedDependencies = true;

    const idHasWildcard = hasWildcard(id);

    const params = {
      message,
      exactVersion: getVersion(),
      releaseType,
      force,
      verbose,
      ignoreUnresolvedDependencies,
      ignoreNewestVersion,
      skipTests,
      skipAutoTag
    };

    if (all || scope || idHasWildcard) {
      return tagAllAction({
        ...params,
        scope,
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        includeImported,
        idWithWildcard: id
      });
    }
    return tagAction({
      ...params,
      id
    });
  }

  report(results: TagResults): string {
    if (!results) return chalk.yellow(NOTHING_TO_TAG_MSG);
    const { taggedComponents, autoTaggedResults, warnings, newComponents }: TagResults = results;
    const changedComponents = taggedComponents.filter(component => !newComponents.searchWithoutVersion(component.id));
    const addedComponents = taggedComponents.filter(component => newComponents.searchWithoutVersion(component.id));
    const autoTaggedCount = autoTaggedResults ? autoTaggedResults.length : 0;

    const warningsOutput = warnings && warnings.length ? `${chalk.yellow(warnings.join('\n'))}\n\n` : '';
    const tagExplanation = `\n(use "bit export [collection]" to push these components to a remote")
(use "bit untag" to unstage versions)\n`;

    const outputComponents = comps => {
      return comps
        .map(component => {
          let componentOutput = `     > ${component.id.toString()}`;
          const autoTag = autoTaggedResults.filter(result =>
            result.triggeredBy.searchWithoutScopeAndVersion(component.id)
          );
          if (autoTag.length) {
            const autoTagComp = autoTag.map(a => a.component.toBitIdWithLatestVersion().toString());
            componentOutput += `\n       ${AUTO_TAGGED_MSG}:
            ${autoTagComp.join('\n            ')}`;
          }
          return componentOutput;
        })
        .join('\n');
    };

    const outputIfExists = (label, explanation, components) => {
      if (!components.length) return '';
      return `\n${chalk.underline(label)}\n(${explanation})\n${outputComponents(components)}\n`;
    };

    return (
      warningsOutput +
      chalk.green(`${taggedComponents.length + autoTaggedCount} component(s) tagged`) +
      tagExplanation +
      outputIfExists('new components', 'first version for components', addedComponents) +
      outputIfExists('changed components', 'components that got a version bump', changedComponents)
    );
  }
}
