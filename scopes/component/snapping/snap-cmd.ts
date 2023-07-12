import chalk from 'chalk';
import { BitId } from '@teambit/legacy-bit-id';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component/consumer-component';
import { IssuesClasses } from '@teambit/component-issues';
import { Command, CommandOptions } from '@teambit/cli';
import { isFeatureEnabled, BUILD_ON_CI } from '@teambit/legacy/dist/api/consumer/lib/feature-toggle';
import { NOTHING_TO_SNAP_MSG, AUTO_SNAPPED_MSG, COMPONENT_PATTERN_HELP } from '@teambit/legacy/dist/constants';
import { BitError } from '@teambit/bit-error';
import { Logger } from '@teambit/logger';
import { SnappingMain, SnapResults } from './snapping.main.runtime';
import { outputIdsIfExists } from './tag-cmd';

export class SnapCmd implements Command {
  name = 'snap [component-pattern]';
  description = 'create an immutable and exportable component snapshot (no release version)';
  extendedDescription: string;
  group = 'development';
  arguments = [
    {
      name: 'component-pattern',
      description: `${COMPONENT_PATTERN_HELP}. By default, all new and modified components are snapped.`,
    },
  ];
  helpUrl = 'docs/components/snaps';
  alias = '';
  options = [
    ['m', 'message <message>', 'log message describing the latest changes'],
    ['', 'unmodified', 'include unmodified components (by default, only new and modified components are snapped)'],
    ['', 'unmerged', 'complete a merge process by snapping the unmerged components'],
    ['b', 'build', 'not needed for now. run the build pipeline in case the feature-flag build-on-ci is enabled'],
    [
      '',
      'editor [editor]',
      'open an editor to write a tag message for each component. optionally, specify the editor-name (defaults to vim).',
    ],
    ['', 'skip-tests', 'skip running component tests during snap process'],
    ['', 'skip-auto-snap', 'skip auto snapping dependents'],
    ['', 'disable-snap-pipeline', 'skip the snap pipeline'],
    ['', 'force-deploy', 'DEPRECATED. use --ignore-build-error instead'],
    ['', 'ignore-build-errors', 'run the snap pipeline although the build pipeline failed'],
    [
      'i',
      'ignore-issues [issues]',
      `ignore component issues (shown in "bit status" as "issues found"), issues to ignore:
[${Object.keys(IssuesClasses).join(', ')}]
to ignore multiple issues, separate them by a comma and wrap with quotes. to ignore all issues, specify "*".`,
    ],
    ['a', 'all', 'DEPRECATED (not needed anymore, it is the default now). snap all new and modified components'],
    [
      '',
      'fail-fast',
      'stop pipeline execution on the first failed task (by default a task is skipped only when its dependent failed)',
    ],
    [
      'f',
      'force',
      'DEPRECATED (use "--skip-tests" or "--unmodified" instead). force-snap even if tests are failing and even when component has not changed',
    ],
  ] as CommandOptions;
  loader = true;
  migration = true;

  constructor(private snapping: SnappingMain, private logger: Logger) {}

  async report(
    [pattern]: string[],
    {
      message = '',
      all = false,
      force = false,
      unmerged = false,
      editor = '',
      ignoreIssues,
      build,
      skipTests = false,
      skipAutoSnap = false,
      disableSnapPipeline = false,
      forceDeploy = false,
      ignoreBuildErrors = false,
      unmodified = false,
      failFast = false,
    }: {
      message?: string;
      all?: boolean;
      force?: boolean;
      unmerged?: boolean;
      editor?: string;
      ignoreIssues?: string;
      build?: boolean;
      skipTests?: boolean;
      skipAutoSnap?: boolean;
      disableSnapPipeline?: boolean;
      forceDeploy?: boolean;
      ignoreBuildErrors?: boolean;
      unmodified?: boolean;
      failFast?: boolean;
    }
  ) {
    build = isFeatureEnabled(BUILD_ON_CI) ? Boolean(build) : true;
    const disableTagAndSnapPipelines = disableSnapPipeline;
    if (all) {
      this.logger.consoleWarning(
        `--all is deprecated, please omit it. "bit snap" by default will snap all new and modified components`
      );
    }
    if (force) {
      this.logger.consoleWarning(
        `--force is deprecated, use either --skip-tests or --unmodified depending on the use case`
      );
      if (pattern) unmodified = true;
    }
    if (!message && !editor) {
      this.logger.consoleWarning(
        `--message will be mandatory in the next few releases. make sure to add a message with your snap`
      );
    }
    if (forceDeploy) {
      this.logger.consoleWarning(`--force-deploy is deprecated, use --ignore-build-errors instead`);
      ignoreBuildErrors = true;
    }
    if (disableTagAndSnapPipelines && ignoreBuildErrors) {
      throw new BitError('you can use either ignore-build-error or disable-snap-pipeline, but not both');
    }

    const results = await this.snapping.snap({
      pattern,
      message,
      unmerged,
      editor,
      ignoreIssues,
      build,
      skipTests,
      skipAutoSnap,
      disableTagAndSnapPipelines,
      ignoreBuildErrors,
      unmodified,
      exitOnFirstFailedTask: failFast,
    });

    if (!results) return chalk.yellow(NOTHING_TO_SNAP_MSG);
    const { snappedComponents, autoSnappedResults, warnings, newComponents, laneName, removedComponents }: SnapResults =
      results;
    const changedComponents = snappedComponents.filter(
      (component) => !newComponents.searchWithoutVersion(component.id)
    );
    const addedComponents = snappedComponents.filter((component) => newComponents.searchWithoutVersion(component.id));
    const autoTaggedCount = autoSnappedResults ? autoSnappedResults.length : 0;

    const warningsOutput = warnings && warnings.length ? `${chalk.yellow(warnings.join('\n'))}\n\n` : '';
    const snapExplanation = `\n(use "bit export" to push these components to a remote")
(use "bit reset" to unstage versions)\n`;

    const compInBold = (id: BitId) => {
      const version = id.hasVersion() ? `@${id.version}` : '';
      return `${chalk.bold(id.toStringWithoutVersion())}${version}`;
    };

    const outputComponents = (comps: ConsumerComponent[]) => {
      return comps
        .map((component) => {
          let componentOutput = `     > ${compInBold(component.id)}`;
          const autoTag = autoSnappedResults.filter((result) =>
            result.triggeredBy.searchWithoutScopeAndVersion(component.id)
          );
          if (autoTag.length) {
            const autoTagComp = autoTag.map((a) => compInBold(a.component.id));
            componentOutput += `\n       ${AUTO_SNAPPED_MSG} (${autoTagComp.length} total):
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
    const laneStr = laneName ? ` on "${laneName}" lane` : '';

    return (
      warningsOutput +
      chalk.green(`${snappedComponents.length + autoTaggedCount} component(s) snapped${laneStr}`) +
      snapExplanation +
      outputIfExists('new components', 'first version for components', addedComponents) +
      outputIfExists('changed components', 'components that got a version bump', changedComponents) +
      outputIdsIfExists('removed components', removedComponents)
    );
  }
}
