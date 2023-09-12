import chalk from 'chalk';
import { BitId } from '@teambit/legacy-bit-id';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component/consumer-component';
import { IssuesClasses } from '@teambit/component-issues';
import { Command, CommandOptions } from '@teambit/cli';
import { isFeatureEnabled, BUILD_ON_CI } from '@teambit/legacy/dist/api/consumer/lib/feature-toggle';
import { NOTHING_TO_SNAP_MSG, AUTO_SNAPPED_MSG, COMPONENT_PATTERN_HELP } from '@teambit/legacy/dist/constants';
import { Logger } from '@teambit/logger';
import { SnappingMain, SnapResults } from './snapping.main.runtime';
import { outputIdsIfExists } from './tag-cmd';
import { BasicTagSnapParams } from './tag-model-component';

export class SnapCmd implements Command {
  name = 'snap [component-pattern]';
  description = 'create an immutable and exportable component snapshot (non-release version)';
  extendedDescription: string;
  group = 'development';
  arguments = [
    {
      name: 'component-pattern',
      description: `${COMPONENT_PATTERN_HELP}. By default, only new and modified components are snapped (add --unmodified to snap all components in the workspace).`,
    },
  ];
  helpUrl = 'reference/components/snaps';
  alias = '';
  options = [
    ['m', 'message <message>', 'snap message describing the latest changes - will appear in component history log'],
    ['', 'unmodified', 'include unmodified components (by default, only new and modified components are snapped)'],
    ['', 'unmerged', 'complete a merge process by snapping the unmerged components'],
    [
      'b',
      'build',
      'not needed for now. run the build pipeline locally in case the feature-flag build-on-ci is enabled',
    ],
    [
      '',
      'editor [editor]',
      'open an editor to write a snap message per component. optionally specify the editor-name (defaults to vim).',
    ],
    ['', 'skip-tests', 'skip running component tests during snap process'],
    ['', 'skip-auto-snap', 'skip auto snapping dependents'],
    [
      '',
      'disable-snap-pipeline',
      'skip the snap pipeline. this will for instance skip packing and publishing component version for install, and app deployment',
    ],
    ['', 'force-deploy', 'DEPRECATED. use --ignore-build-error instead'],
    ['', 'ignore-build-errors', 'proceed to snap pipeline even when build pipeline fails'],
    [
      'i',
      'ignore-issues [issues]',
      `ignore component issues (shown in "bit status" as "issues found"), issues to ignore:
[${Object.keys(IssuesClasses).join(', ')}]
to ignore multiple issues, separate them by a comma and wrap with quotes. to ignore all issues, specify "*".`,
    ],
    ['a', 'all', 'DEPRECATED (not needed anymore, now the default). snap all new and modified components'],
    [
      '',
      'fail-fast',
      'stop pipeline execution on the first failed task (by default a task is skipped only when its dependency failed)',
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
      all?: boolean;
      force?: boolean;
      unmerged?: boolean;
      editor?: string;
      ignoreIssues?: string;
      skipAutoSnap?: boolean;
      disableSnapPipeline?: boolean;
      forceDeploy?: boolean;
      unmodified?: boolean;
      failFast?: boolean;
    } & BasicTagSnapParams
  ) {
    build = isFeatureEnabled(BUILD_ON_CI) ? Boolean(build) : true;
    const disableTagAndSnapPipelines = disableSnapPipeline;
    if (all) {
      this.logger.consoleWarning(
        `--all is deprecated, please omit it. By default all new and modified components are snapped, to snap all components add --unmodified`
      );
    }
    if (force) {
      this.logger.consoleWarning(
        `--force is deprecated, use either --skip-tests or --ignore-build-errors depending on the use case`
      );
      if (pattern) unmodified = true;
    }
    if (!message && !editor) {
      this.logger.consoleWarning(
        `--message will be mandatory in the next few releases. make sure to add a message with your snap, will be displayed in the version history`
      );
    }
    if (forceDeploy) {
      this.logger.consoleWarning(`--force-deploy is deprecated, use --ignore-build-errors instead`);
      ignoreBuildErrors = true;
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
(use "bit reset" to unstage all local versions, or "bit reset --head" to only unstage the latest local snap)\n`;

    const compInBold = (id: BitId) => {
      const version = id.hasVersion() ? `@${id.version}` : '';
      return `${chalk.bold(id.toStringWithoutVersion())}${version}`;
    };

    const outputComponents = (comps: ConsumerComponent[]) => {
      return comps
        .map((component) => {
          let componentOutput = `     > ${compInBold(component.id)}`;
          const autoTag = autoSnappedResults.filter((result) => result.triggeredBy.searchWithoutVersion(component.id));
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
