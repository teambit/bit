import chalk from 'chalk';
import { LegacyCommand, CommandOptions } from '../../legacy-command';
import { snapAction } from '../../../api/consumer';
import { BASE_DOCS_DOMAIN, WILDCARD_HELP } from '../../../constants';
import GeneralError from '../../../error/general-error';
import { SnapResults } from '../../../api/consumer/lib/snap';
import { throwForUsingLaneIfDisabled } from '../../../api/consumer/lib/feature-toggle';

export const NOTHING_TO_SNAP_MSG = 'nothing to snap';
export const AUTO_SNAPPED_MSG = 'auto-snapped dependents';

export default class Snap implements LegacyCommand {
  name = 'snap [id]';
  description = `record component changes.
  https://${BASE_DOCS_DOMAIN}/docs/snap-component-version
  ${WILDCARD_HELP('snap')}`;
  alias = '';
  opts = [
    ['m', 'message <message>', 'log message describing the user changes'],
    ['a', 'all', 'snap all new and modified components'],
    ['f', 'force', 'force-snap even if tests are failing and even when component has not changed'],
    ['v', 'verbose', 'show specs output on failure'],
    ['i', 'ignore-unresolved-dependencies', 'ignore missing dependencies (default = false)'],
    ['', 'skip-tests', 'skip running component tests during snap process'],
    ['', 'skip-auto-snap', 'skip auto snapping dependents'],
  ] as CommandOptions;
  loader = true;
  migration = true;

  action(
    [id]: string[],
    {
      message = '',
      all = false,
      force = false,
      verbose = false,
      ignoreUnresolvedDependencies = false,
      skipTests = false,
      skipAutoSnap = false,
    }: {
      message?: string;
      all?: boolean;
      force?: boolean;
      verbose?: boolean;
      ignoreUnresolvedDependencies?: boolean;
      skipTests?: boolean;
      skipAutoSnap?: boolean;
    }
  ): Promise<any> {
    throwForUsingLaneIfDisabled();
    if (!id && !all) {
      throw new GeneralError('missing [id]. to snap all components, please use --all flag');
    }
    if (id && all) {
      throw new GeneralError(
        'you can use either a specific component [id] to snap a particular component or --all flag to snap them all'
      );
    }

    return snapAction({
      id,
      message,
      force,
      verbose,
      ignoreUnresolvedDependencies,
      skipTests,
      skipAutoSnap,
    });
  }

  report(results: SnapResults): string {
    if (!results) return chalk.yellow(NOTHING_TO_SNAP_MSG);
    const { snappedComponents, autoSnappedResults, warnings, newComponents }: SnapResults = results;
    const changedComponents = snappedComponents.filter(
      (component) => !newComponents.searchWithoutVersion(component.id)
    );
    const addedComponents = snappedComponents.filter((component) => newComponents.searchWithoutVersion(component.id));
    const autoTaggedCount = autoSnappedResults ? autoSnappedResults.length : 0;

    const warningsOutput = warnings && warnings.length ? `${chalk.yellow(warnings.join('\n'))}\n\n` : '';
    const tagExplanation = `\n(use "bit export [collection]" to push these components to a remote")
(use "bit untag" to unstage versions)\n`;

    const outputComponents = (comps) => {
      return comps
        .map((component) => {
          let componentOutput = `     > ${component.id.toString()}`;
          const autoTag = autoSnappedResults.filter((result) =>
            result.triggeredBy.searchWithoutScopeAndVersion(component.id)
          );
          if (autoTag.length) {
            const autoTagComp = autoTag.map((a) => a.component.toBitIdWithLatestVersion().toString());
            componentOutput += `\n       ${AUTO_SNAPPED_MSG}: ${autoTagComp.join(', ')}`;
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
      chalk.green(`${snappedComponents.length + autoTaggedCount} component(s) snapped`) +
      tagExplanation +
      outputIfExists('new components', 'first version for components', addedComponents) +
      outputIfExists('changed components', 'components that got a version bump', changedComponents)
    );
  }
}
