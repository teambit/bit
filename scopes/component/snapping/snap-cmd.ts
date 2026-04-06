import chalk from 'chalk';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { IssuesClasses } from '@teambit/component-issues';
import type { Command, CommandOptions } from '@teambit/cli';
import {
  formatItem,
  formatSection,
  formatHint,
  formatDetailsHint,
  formatSuccessSummary,
  warnSymbol,
  joinSections,
} from '@teambit/cli';
import type { Report } from '@teambit/cli';
import {
  NOTHING_TO_SNAP_MSG,
  AUTO_SNAPPED_MSG,
  COMPONENT_PATTERN_HELP,
  CFG_FORCE_LOCAL_BUILD,
} from '@teambit/legacy.constants';
import type { Logger } from '@teambit/logger';
import type { SnappingMain, SnapResults } from './snapping.main.runtime';
import { outputIdsIfExists, compInBold } from './tag-cmd';
import type { BasicTagSnapParams } from './version-maker';
import type { ConfigStoreMain } from '@teambit/config-store';

export class SnapCmd implements Command {
  name = 'snap [component-pattern]';
  description = 'create immutable component snapshots for development versions';
  extendedDescription = `creates snapshots with hash-based versions for development and testing. snapshots are immutable and exportable.
by default snaps only new and modified components. use for development iterations before creating semantic version tags.
snapshots maintain component history and enable collaboration without formal releases.`;
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
    return snapResultReport(results);
  }
}

export function snapResultReport(results: SnapResults): string | Report {
  const {
    snappedComponents,
    autoSnappedResults,
    warnings,
    newComponents,
    laneName,
    removedComponents,
    totalComponentsCount,
  }: SnapResults = results;
  const changedComponents = snappedComponents.filter((component) => {
    return !newComponents.searchWithoutVersion(component.id) && !removedComponents?.searchWithoutVersion(component.id);
  });
  const addedComponents = snappedComponents.filter((component) => newComponents.searchWithoutVersion(component.id));
  const autoSnappedCount = autoSnappedResults ? autoSnappedResults.length : 0;
  const totalCount = totalComponentsCount ?? snappedComponents.length + autoSnappedCount;

  const formatCompMinimal = (component: ConsumerComponent): string => {
    return formatItem(compInBold(component.id));
  };

  const formatCompDetailed = (component: ConsumerComponent): string => {
    let output = formatItem(compInBold(component.id));
    const autoSnap = (autoSnappedResults ?? []).filter((result) =>
      result.triggeredBy.searchWithoutVersion(component.id)
    );
    if (autoSnap.length) {
      const autoSnapComp = autoSnap.map((a) => a.component.id.toString());
      output += `\n     ${AUTO_SNAPPED_MSG} (${autoSnapComp.length} total):\n       ${autoSnapComp.join('\n       ')}`;
    }
    return output;
  };

  const hasAutoSnapped = autoSnappedCount > 0;

  const buildSections = (formatComp: (c: ConsumerComponent) => string) => {
    const newSection = formatSection('new components', 'first version for components', addedComponents.map(formatComp));
    const changedSection = formatSection(
      'changed components',
      'components that got a version bump',
      changedComponents.map(formatComp)
    );
    return { newSection, changedSection };
  };

  const removedSection = outputIdsIfExists('removed components', removedComponents);

  const warningsSection =
    warnings && warnings.length ? warnings.map((w) => `${warnSymbol} ${chalk.yellow(w)}`).join('\n') : '';

  const laneStr = laneName ? ` on "${laneName}" lane` : '';
  const summary = formatSuccessSummary(`${totalCount} component(s) snapped${laneStr}`);
  const snapExplanation = formatHint(
    '(use "bit export" to push these components to a remote)\n(use "bit reset" to unstage all local versions, or "bit reset --head" to only unstage the latest local snap)'
  );

  // Build minimal output
  const { newSection, changedSection } = buildSections(hasAutoSnapped ? formatCompMinimal : formatCompDetailed);
  const autoSnapHint = hasAutoSnapped ? formatDetailsHint(`all ${autoSnappedCount} auto-snapped dependents`) : '';
  const footerParts = [summary, autoSnapHint, snapExplanation].filter(Boolean).join('\n');
  const data = joinSections([newSection, changedSection, removedSection, warningsSection, footerParts]);

  if (!hasAutoSnapped) {
    return data;
  }

  // Build detailed output (with full auto-snapped listing)
  const { newSection: newDetailed, changedSection: changedDetailed } = buildSections(formatCompDetailed);
  const detailedFooter = [summary, snapExplanation].filter(Boolean).join('\n');
  const details = joinSections([newDetailed, changedDetailed, removedSection, warningsSection, detailedFooter]);

  return { data, code: 0, details };
}

/** @deprecated use snapResultReport instead */
export function snapResultOutput(results: SnapResults): string {
  const result = snapResultReport(results);
  return typeof result === 'string' ? result : result.data;
}
