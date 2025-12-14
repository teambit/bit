import type { Command, CommandOptions } from '@teambit/cli';
import type { StatusMain, StatusResult } from './status.main.runtime';
import { formatStatusOutput } from './status-formatter';

type StatusFlags = {
  strict?: boolean;
  verbose?: boolean;
  lanes?: boolean;
  ignoreCircularDependencies?: boolean;
  warnings?: boolean;
  failOnError?: boolean;
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
};

export class StatusCmd implements Command {
  name = 'status';
  description = 'show workspace component status and issues';
  group = 'info-analysis';
  extendedDescription = `displays the current state of all workspace components including new, modified, staged, and problematic components.
identifies blocking issues that prevent tagging/snapping and provides warnings with --warnings flag.
essential for understanding workspace health before versioning components.`;
  alias = 's';
  options = [
    ['j', 'json', 'return a json version of the component'],
    ['w', 'warnings', 'show warnings. by default, only issues that block tag/snap are shown'],
    ['', 'verbose', 'show extra data: full snap hashes for staged components, and divergence point for lanes'],
    ['l', 'lanes', 'when on a lane, show updates from main and updates from forked lanes'],
    ['', 'strict', 'exit with code 1 if any issues are found (both errors and warnings)'],
    ['', 'fail-on-error', 'exit with code 1 only when tag/snap blocker issues are found (not warnings)'],
    ['c', 'ignore-circular-dependencies', 'do not check for circular dependencies to get the results quicker'],
  ] as CommandOptions;
  loader = true;

  constructor(private status: StatusMain) {}

  async json(_args, { lanes, ignoreCircularDependencies }: StatusFlags): Promise<StatusJsonResults> {
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
    };
  }

  async report(_args, { strict, verbose, lanes, ignoreCircularDependencies, warnings, failOnError }: StatusFlags) {
    const statusResult: StatusResult = await this.status.status({ lanes, ignoreCircularDependencies });
    return formatStatusOutput(statusResult, { strict, verbose, warnings, failOnError });
  }
}
