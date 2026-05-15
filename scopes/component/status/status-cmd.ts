import type { Command } from '@teambit/cli';
import { renderSections, formatSuccessSummary, formatSection, formatItem, joinSections } from '@teambit/cli';
import type { ComponentID } from '@teambit/component-id';
import chalk from 'chalk';
import type { StatusMain, StatusResult } from './status.main.runtime';
import { formatStatusOutput } from './status-formatter';
import { statusCommand } from './status.commands';

type StatusFlags = {
  strict?: boolean;
  verbose?: boolean;
  lanes?: boolean;
  ignoreCircularDependencies?: boolean;
  warnings?: boolean;
  failOnError?: boolean;
  quick?: boolean;
  expand?: boolean;
};

type QuickStatusJsonResults = {
  modified: string[];
  newComponents: string[];
};

type StatusJsonResults = {
  newComponents: string[];
  modifiedComponents: string[];
  stagedComponents: Array<{ id: string; versions: string[] }>;
  unavailableOnMain: string[];
  componentsWithIssues: Array<{
    id: string;
    issues: Array<{
      type: string;
      description: string;
      data: any;
    }>;
  }>;
  importPendingComponents: string[];
  autoTagPendingComponents: string[];
  invalidComponents: Array<{ id: string; error: Error }>;
  locallySoftRemoved: string[];
  remotelySoftRemoved: string[];
  outdatedComponents: Array<{ id: string; headVersion: string; latestVersion?: string }>;
  mergePendingComponents: string[];
  componentsDuringMergeState: string[];
  softTaggedComponents: string[];
  snappedComponents: string[];
  localOnly: string[];
  pendingUpdatesFromMain: Array<{
    id: string;
    divergeData: any;
  }>;
  updatesFromForked: Array<{
    id: string;
    divergeData: any;
  }>;
  currentLaneId: string;
  forkedLaneId: string | undefined;
  workspaceIssues: string[];
  pendingUpdateDependents: string[];
};

export class StatusCmd implements Command {
  name = statusCommand.name;
  alias = statusCommand.alias;
  description = statusCommand.description;
  extendedDescription = statusCommand.extendedDescription;
  group = statusCommand.group;
  options = statusCommand.options;
  loader = statusCommand.loader;

  constructor(private status: StatusMain) {}

  async json(
    _args,
    { lanes, ignoreCircularDependencies, quick }: StatusFlags
  ): Promise<StatusJsonResults | QuickStatusJsonResults> {
    if (quick) {
      const { modified, newComps } = await this.status.statusMini();
      return {
        modified: modified.map((m) => m.toStringWithoutVersion()),
        newComponents: newComps.map((m) => m.toStringWithoutVersion()),
      };
    }
    const {
      newComponents,
      modifiedComponents,
      stagedComponents,
      componentsWithIssues,
      importPendingComponents,
      autoTagPendingComponents,
      invalidComponents,
      locallySoftRemoved,
      remotelySoftRemoved,
      outdatedComponents,
      mergePendingComponents,
      componentsDuringMergeState,
      softTaggedComponents,
      snappedComponents,
      unavailableOnMain,
      pendingUpdatesFromMain,
      updatesFromForked,
      currentLaneId,
      forkedLaneId,
      workspaceIssues,
      localOnly,
      pendingUpdateDependents,
    }: StatusResult = await this.status.status({ lanes, ignoreCircularDependencies });
    return {
      newComponents: newComponents.map((c) => c.toStringWithoutVersion()),
      modifiedComponents: modifiedComponents.map((c) => c.toStringWithoutVersion()),
      stagedComponents: stagedComponents.map((c) => ({ id: c.id.toStringWithoutVersion(), versions: c.versions })),
      unavailableOnMain: unavailableOnMain.map((c) => c.toStringWithoutVersion()),
      componentsWithIssues: componentsWithIssues.map((c) => ({
        id: c.id.toStringWithoutVersion(),
        issues: c.issues?.toObjectIncludeDataAsString(),
      })),
      importPendingComponents: importPendingComponents.map((id) => id.toStringWithoutVersion()),
      autoTagPendingComponents: autoTagPendingComponents.map((s) => s.toStringWithoutVersion()),
      invalidComponents: invalidComponents.map(({ id, error }) => ({ id: id.toStringWithoutVersion(), error })),
      locallySoftRemoved: locallySoftRemoved.map((id) => id.toStringWithoutVersion()),
      remotelySoftRemoved: remotelySoftRemoved.map((id) => id.toStringWithoutVersion()),
      outdatedComponents: outdatedComponents.map((c) => ({ ...c, id: c.id.toStringWithoutVersion() })),
      mergePendingComponents: mergePendingComponents.map((c) => c.id.toStringWithoutVersion()),
      componentsDuringMergeState: componentsDuringMergeState.map((id) => id.toStringWithoutVersion()),
      softTaggedComponents: softTaggedComponents.map((s) => s.toStringWithoutVersion()),
      snappedComponents: snappedComponents.map((s) => s.toStringWithoutVersion()),
      localOnly: localOnly.map((id) => id.toStringWithoutVersion()),
      pendingUpdatesFromMain: pendingUpdatesFromMain.map((p) => ({
        id: p.id.toStringWithoutVersion(),
        divergeData: p.divergeData,
      })),
      updatesFromForked: updatesFromForked.map((p) => ({
        id: p.id.toStringWithoutVersion(),
        divergeData: p.divergeData,
      })),
      currentLaneId: currentLaneId.toString(),
      forkedLaneId: forkedLaneId?.toString(),
      workspaceIssues,
      pendingUpdateDependents: pendingUpdateDependents.map((id) => id.toStringWithoutVersion()),
    };
  }

  async report(
    _args,
    { strict, verbose, lanes, ignoreCircularDependencies, warnings, failOnError, quick, expand }: StatusFlags
  ) {
    if (quick) {
      return this.reportQuick();
    }
    const statusResult: StatusResult = await this.status.status({ lanes, ignoreCircularDependencies });
    const result = formatStatusOutput(statusResult, { strict, verbose, warnings, failOnError });

    // Collapse long informational sections unless --expand
    if (result.sections?.some((s) => s.collapsible)) {
      return { data: renderSections(result.sections, expand), code: result.code };
    }

    return result;
  }

  private async reportQuick() {
    const { modified, newComps } = await this.status.statusMini();
    const formatCategory = (title: string, ids: ComponentID[]) => {
      return formatSection(
        title,
        '',
        ids.map((id) => formatItem(chalk.cyan(id.toStringWithoutVersion())))
      );
    };
    const data =
      joinSections([
        formatCategory('modified components (files only)', modified),
        formatCategory('new components', newComps),
      ]) ||
      formatSuccessSummary(
        'no new or modified components (based on file changes only, use "bit status" for full check)'
      );

    return { data, code: 0 };
  }
}
