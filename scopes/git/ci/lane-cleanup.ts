/**
 * The last step of `bit ci merge`: find the lane the merged pull request came from and archive it —
 * unless the lane still carries components of other scopes that have not reached their own main
 * (see `lane-archive-guard`).
 */
import { formatHint, formatSuccessSummary, formatTitle, formatWarningSummary } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import type { LaneId } from '@teambit/lane-id';
import type { Lane } from '@teambit/objects';
import { SourceBranchDetector } from './source-branch-detector';
import {
  laneArchiveDecision,
  laneFingerprint,
  laneMovedSummary,
  laneUnreadableBeforeArchiveSummary,
  readRemoteLane,
} from './lane-archive-guard';
import type { LaneArchiveDeps } from './lane-archive-guard';

export type LaneCleanupDeps = LaneArchiveDeps & {
  logger: Logger;
  defaultScope: string;
  parseLaneId(idStr: string): Promise<LaneId>;
  /** `{defaultScope}/{sanitized branch}` — the lane a branch maps to when nothing else says */
  convertBranchToLaneId(branchName: string): string;
  archiveLane(laneId: string): Promise<'deleted' | 'not-found' | 'error'>;
};

export class LaneCleanup {
  constructor(private deps: LaneCleanupDeps) {}

  /**
   * Performs lane cleanup by attempting to detect and archive the source lane after a successful
   * merge, even when running on the main branch.
   */
  async run(currentLane: Lane | undefined, explicitLaneName?: string, initialCommitSha?: string) {
    const { logger } = this.deps;
    logger.console(formatTitle('Lane Cleanup'));

    // If we already have a current lane, use it
    if (currentLane) {
      logger.console(formatHint(`Found current lane: ${currentLane.name}`));
      await this.archiveIfFullyReleased(currentLane.toLaneId());
      return;
    }

    // If no current lane but explicit lane name provided, try to archive it
    if (explicitLaneName) {
      logger.console(formatHint(`Using explicitly provided lane name: ${explicitLaneName}`));
      try {
        const laneId = await this.deps.parseLaneId(explicitLaneName);
        await this.archiveIfFullyReleased(laneId);
        return;
      } catch (e: any) {
        logger.console(formatWarningSummary(`Failed to parse lane name '${explicitLaneName}': ${e.message}`));
      }
    }

    // Try to auto-detect source branch/lane name using the dedicated detector
    const sourceBranchDetector = new SourceBranchDetector(logger);
    const sourceBranchName = await sourceBranchDetector.getSourceBranchName(initialCommitSha);
    if (!sourceBranchName) {
      logger.console(
        formatWarningSummary('No current lane and unable to detect source branch - skipping lane cleanup')
      );
      return;
    }
    try {
      const laneIdStr = this.deps.convertBranchToLaneId(sourceBranchName);
      logger.console(
        formatHint(`Attempting to archive lane based on source branch: ${sourceBranchName} -> ${laneIdStr}`)
      );
      const laneId = await this.deps.parseLaneId(laneIdStr);
      await this.archiveIfFullyReleased(laneId);
    } catch (e: any) {
      logger.console(
        formatWarningSummary(`Error during lane cleanup for source branch '${sourceBranchName}': ${e.message}`)
      );
    }
  }

  /**
   * Archives the lane unless it still carries components of other scopes whose lane heads are not
   * on their own main yet. Each scope's repository releases its own slice, so the last release is
   * the one that archives; an earlier archive would strand the other slices on an unreadable lane
   * and make every other repository's `bit ci sync` close its mirror pull request.
   */
  private async archiveIfFullyReleased(laneId: LaneId): Promise<'deleted' | 'not-found' | 'error' | 'kept'> {
    const { logger } = this.deps;
    const decision = await laneArchiveDecision(laneId, this.deps.defaultScope, this.deps);
    if (decision.summary) {
      logger.console(
        decision.archive ? formatSuccessSummary(decision.summary) : formatWarningSummary(decision.summary)
      );
    }
    if (!decision.archive) return 'kept';
    if (decision.fingerprint !== undefined) {
      // an existing lane with no entries fingerprints to '' and still deserves the re-read
      // Re-read right before the forced removal: a writer may have exported to the lane since the
      // decision was made. The window between this read and the removal remains, but it no longer
      // spans the object imports and history checks above. A failed re-read keeps the lane open,
      // like every other unreadable state; a lane that is gone falls through to archiveLane, which
      // reports not-found as it always has.
      let lane;
      try {
        lane = await readRemoteLane(laneId, this.deps);
      } catch (e: any) {
        logger.console(formatWarningSummary(laneUnreadableBeforeArchiveSummary(laneId.toString(), e.message)));
        return 'kept';
      }
      if (lane && laneFingerprint(lane) !== decision.fingerprint) {
        logger.console(formatWarningSummary(laneMovedSummary(laneId.toString())));
        return 'kept';
      }
    }
    return this.deps.archiveLane(laneId.toString());
  }
}
