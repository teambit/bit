import chalk from 'chalk';
import { IssuesClasses } from '@teambit/component-issues';
import { Command, CommandOptions } from '@teambit/cli';
import { snapAction } from '@teambit/legacy/dist/api/consumer';
import { isFeatureEnabled, BUILD_ON_CI } from '@teambit/legacy/dist/api/consumer/lib/feature-toggle';
import { BASE_DOCS_DOMAIN, WILDCARD_HELP, NOTHING_TO_SNAP_MSG, AUTO_SNAPPED_MSG } from '@teambit/legacy/dist/constants';
import { BitError } from '@teambit/bit-error';
import { SnapResults } from '@teambit/legacy/dist/api/consumer/lib/snap';

export class SnapCmd implements Command {
  name = 'snap [id]';
  description = `record component changes.
  https://${BASE_DOCS_DOMAIN}/components/snaps
  ${WILDCARD_HELP('snap')}`;
  alias = '';
  options = [
    ['m', 'message <message>', 'log message describing the user changes'],
    ['a', 'all', 'snap all new and modified components'],
    ['f', 'force', 'force-snap even if tests are failing and even when component has not changed'],
    ['v', 'verbose', 'show specs output on failure'],
    ['', 'build', 'Harmony only. run the pipeline build and complete the tag'],
    ['', 'skip-tests', 'skip running component tests during snap process'],
    ['', 'skip-auto-snap', 'skip auto snapping dependents'],
    ['', 'disable-snap-pipeline', 'skip the snap pipeline'],
    ['', 'force-deploy', 'Harmony only. run the deploy pipeline although the build failed'],
    [
      'i',
      'ignore-issues [issues]',
      `ignore component issues (shown in "bit status" as "issues found"), issues to ignore:
[${Object.keys(IssuesClasses).join(', ')}]
to ignore multiple issues, separate them by a comma and wrap with quotes. to ignore all issues, specify "*".`,
    ],
  ] as CommandOptions;
  loader = true;
  private = true;
  migration = true;

  async report(
    [id]: string[],
    {
      message = '',
      all = false,
      force = false,
      verbose = false,
      ignoreIssues,
      build,
      skipTests = false,
      skipAutoSnap = false,
      disableSnapPipeline = false,
      forceDeploy = false,
    }: {
      message?: string;
      all?: boolean;
      force?: boolean;
      verbose?: boolean;
      ignoreIssues?: string;
      build?: boolean;
      skipTests?: boolean;
      skipAutoSnap?: boolean;
      disableSnapPipeline?: boolean;
      forceDeploy?: boolean;
    }
  ) {
    build = isFeatureEnabled(BUILD_ON_CI) ? Boolean(build) : true;
    if (!id && !all) {
      throw new BitError('missing [id]. to snap all components, please use --all flag');
    }
    if (id && all) {
      throw new BitError(
        'you can use either a specific component [id] to snap a particular component or --all flag to snap them all'
      );
    }
    const disableTagAndSnapPipelines = disableSnapPipeline;
    if (disableTagAndSnapPipelines && forceDeploy) {
      throw new BitError('you can use either force-deploy or disable-snap-pipeline, but not both');
    }

    const results = await snapAction({
      id,
      message,
      force,
      verbose,
      ignoreIssues,
      build,
      skipTests,
      skipAutoSnap,
      disableTagAndSnapPipelines,
      forceDeploy,
    });

    if (!results) return chalk.yellow(NOTHING_TO_SNAP_MSG);
    const { snappedComponents, autoSnappedResults, warnings, newComponents, laneName }: SnapResults = results;
    const changedComponents = snappedComponents.filter(
      (component) => !newComponents.searchWithoutVersion(component.id)
    );
    const addedComponents = snappedComponents.filter((component) => newComponents.searchWithoutVersion(component.id));
    const autoTaggedCount = autoSnappedResults ? autoSnappedResults.length : 0;

    const warningsOutput = warnings && warnings.length ? `${chalk.yellow(warnings.join('\n'))}\n\n` : '';
    const tagExplanation = `\n(use "bit export" to push these components to a remote")
(use "bit untag" to unstage versions)\n`;

    const outputComponents = (comps) => {
      return comps
        .map((component) => {
          let componentOutput = `     > ${component.id.toString()}`;
          const autoTag = autoSnappedResults.filter((result) =>
            result.triggeredBy.searchWithoutScopeAndVersion(component.id)
          );
          if (autoTag.length) {
            const autoTagComp = autoTag.map((a) => a.component.id.toString());
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
    const laneStr = laneName ? ` on "${laneName}" lane` : '';

    return (
      warningsOutput +
      chalk.green(`${snappedComponents.length + autoTaggedCount} component(s) snapped${laneStr}`) +
      tagExplanation +
      outputIfExists('new components', 'first version for components', addedComponents) +
      outputIfExists('changed components', 'components that got a version bump', changedComponents)
    );
  }
}
