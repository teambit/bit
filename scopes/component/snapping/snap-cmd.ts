import chalk from 'chalk';
import { ComponentID } from '@teambit/component-id';
import { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { IssuesClasses } from '@teambit/component-issues';
import { Command, CommandOptions } from '@teambit/cli';
import {
  NOTHING_TO_SNAP_MSG,
  AUTO_SNAPPED_MSG,
  COMPONENT_PATTERN_HELP,
  CFG_FORCE_LOCAL_BUILD,
} from '@teambit/legacy.constants';
import { Logger } from '@teambit/logger';
import { SnappingMain, SnapResults } from './snapping.main.runtime';
import { outputIdsIfExists } from './tag-cmd';
import { BasicTagSnapParams } from './version-maker';
import { ConfigStoreMain } from '@teambit/config-store';

export class SnapCmd implements Command {
  name = 'snap [component-pattern]';
  description = 'create an immutable and exportable component snapshot (non-release version)';
  extendedDescription: string;
  group = 'version-control';
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
    ['u', 'unmodified', 'include unmodified components (by default, only new and modified components are snapped)'],
    ['', 'unmerged', 'complete a merge process by snapping the unmerged components'],
    ['b', 'build', 'locally run the build pipeline (i.e. not via rippleCI) and complete the snap'],
    [
      '',
      'editor [editor]',
      'open an editor to write a snap message per component. optionally specify the editor-name (defaults to vim).',
    ],
    ['', 'skip-tests', 'skip running component tests during snap process'],
    [
      '',
      'skip-tasks <string>',
      `skip the given tasks. for multiple tasks, separate by a comma and wrap with quotes.
specify the task-name (e.g. "TypescriptCompiler") or the task-aspect-id (e.g. teambit.compilation/compiler)`,
    ],
    ['', 'skip-auto-snap', 'skip auto snapping dependents'],
    [
      '',
      'disable-snap-pipeline',
      'skip the snap pipeline. this will for instance skip packing and publishing component version for install, and app deployment',
    ],
    ['', 'ignore-build-errors', 'proceed to snap pipeline even when build pipeline fails'],
    ['', 'loose', 'allow snap --build to succeed even if tasks like tests or lint fail'],
    ['', 'rebuild-deps-graph', 'do not reuse the saved dependencies graph, instead build it from scratch'],
    [
      'i',
      'ignore-issues <issues>',
      `ignore component issues (shown in "bit status" as "issues found"), issues to ignore:
[${Object.keys(IssuesClasses).join(', ')}]
to ignore multiple issues, separate them by a comma and wrap with quotes. to ignore all issues, specify "*".`,
    ],
    [
      '',
      'fail-fast',
      'stop pipeline execution on the first failed task (by default a task is skipped only when its dependency failed)',
    ],
    [
      '',
      'detach-head',
      'UNSUPPORTED YET. in case a component is checked out to an older version, snap it without changing the head',
    ],
  ] as CommandOptions;
  loader = true;

  constructor(
    private snapping: SnappingMain,
    private logger: Logger,
    private configStore: ConfigStoreMain
  ) {}

  async report(
    [pattern]: string[],
    {
      message = '',
      unmerged = false,
      editor = '',
      ignoreIssues,
      build,
      skipTests = false,
      skipTasks,
      skipAutoSnap = false,
      disableSnapPipeline = false,
      ignoreBuildErrors = false,
      rebuildDepsGraph,
      unmodified = false,
      failFast = false,
      detachHead,
      loose = false,
    }: {
      unmerged?: boolean;
      editor?: string;
      ignoreIssues?: string;
      skipAutoSnap?: boolean;
      disableSnapPipeline?: boolean;
      unmodified?: boolean;
      failFast?: boolean;
    } & BasicTagSnapParams
  ) {
    build = this.configStore.getConfigBoolean(CFG_FORCE_LOCAL_BUILD) || Boolean(build);
    const disableTagAndSnapPipelines = disableSnapPipeline;
    if (!message && !editor) {
      this.logger.consoleWarning(
        `--message will be mandatory in the next few releases. make sure to add a message with your snap, will be displayed in the version history`
      );
    }

    const results = await this.snapping.snap({
      pattern,
      message,
      unmerged,
      editor,
      ignoreIssues,
      build,
      skipTests,
      skipTasks,
      skipAutoSnap,
      disableTagAndSnapPipelines,
      ignoreBuildErrors,
      rebuildDepsGraph,
      unmodified,
      exitOnFirstFailedTask: failFast,
      detachHead,
      loose,
    });

    if (!results) return chalk.yellow(NOTHING_TO_SNAP_MSG);
    const { snappedComponents, autoSnappedResults, warnings, newComponents, laneName, removedComponents }: SnapResults =
      results;
    const changedComponents = snappedComponents.filter((component) => {
      return (
        !newComponents.searchWithoutVersion(component.id) && !removedComponents?.searchWithoutVersion(component.id)
      );
    });
    const addedComponents = snappedComponents.filter((component) => newComponents.searchWithoutVersion(component.id));
    const autoTaggedCount = autoSnappedResults ? autoSnappedResults.length : 0;

    const warningsOutput = warnings && warnings.length ? `${chalk.yellow(warnings.join('\n'))}\n\n` : '';
    const snapExplanation = `\n(use "bit export" to push these components to a remote")
(use "bit reset --all" to unstage all local versions, or "bit reset --head" to only unstage the latest local snap)`;

    const compInBold = (id: ComponentID) => {
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
      outputIfExists('new components', 'first version for components', addedComponents) +
      outputIfExists('changed components', 'components that got a version bump', changedComponents) +
      outputIdsIfExists('removed components', removedComponents) +
      warningsOutput +
      chalk.green(`\n${snappedComponents.length + autoTaggedCount} component(s) snapped${laneStr}`) +
      snapExplanation
    );
  }
}
