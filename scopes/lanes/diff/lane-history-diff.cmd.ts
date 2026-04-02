import type { Command, CommandOptions } from '@teambit/cli';
import type { ScopeMain } from '@teambit/scope';
import type { Workspace } from '@teambit/workspace';
import type { ComponentCompareMain } from '@teambit/component-compare';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import { LaneDiffGenerator } from './lane-diff-generator';
import { BitError } from '@teambit/bit-error';
import type { LanesMain } from '@teambit/lanes';

export class LaneHistoryDiffCmd implements Command {
  name = 'history-diff [history-id] [to-history-id]';
  description = 'show diff between lane-history entries';
  extendedDescription = `with no arguments - diff the latest history entry against its predecessor
with one argument - diff the given history entry against its predecessor
with two arguments - diff between two specific history entries (first=from, second=to), useful for comparing any two points in history
run "bit lane history" to find history-ids`;
  alias = '';
  options = [
    ['l', 'lane <lane-name>', 'the name of the lane to diff. if not specified, the current lane is used'],
    [
      '',
      'pattern <component-pattern>',
      `show lane-diff for components conforming to the specified component-pattern only
component-pattern format: ${COMPONENT_PATTERN_HELP}`,
    ],
  ] as CommandOptions;
  loader = true;

  constructor(
    private lanes: LanesMain,
    private workspace: Workspace,
    private scope: ScopeMain,
    private componentCompare: ComponentCompareMain
  ) {}

  async report(
    [historyId, toHistoryId]: string[],
    { lane, pattern }: { lane?: string; pattern?: string }
  ): Promise<string> {
    const laneId = lane ? await this.lanes.parseLaneId(lane) : this.lanes.getCurrentLaneId();
    if (!laneId || laneId.isDefault()) throw new BitError(`unable to show diff-history of the default lane (main)`);
    await this.lanes.importLaneHistory(laneId);
    const laneHistory = await this.lanes.getLaneHistory(laneId);

    let fromId: string;
    let toId: string;
    const historyIds = laneHistory.getHistoryIds();
    const laneObj = await this.lanes.loadLane(laneId);
    if (!laneObj) throw new BitError(`unable to load lane "${laneId.toString()}"`);

    if (historyId && toHistoryId) {
      // two args: explicit from and to — no fallback
      fromId = historyId;
      toId = toHistoryId;
    } else {
      const laneDiffGenerator = new LaneDiffGenerator(this.workspace, this.scope, this.componentCompare);

      if (historyId) {
        // one arg: diff this entry against its nearest available predecessor
        toId = historyId;
        const toIndex = historyIds.indexOf(historyId);
        if (toIndex < 0) throw new BitError(`history-id "${historyId}" was not found`);
        fromId = await this.findAvailableEntry(laneDiffGenerator, laneObj, laneHistory, historyIds, toIndex - 1);
      } else {
        // no args: find the latest available "to", then its nearest available predecessor
        if (historyIds.length < 2)
          throw new BitError(`need at least two history entries to diff, got ${historyIds.length}`);
        toId = await this.findAvailableEntry(
          laneDiffGenerator,
          laneObj,
          laneHistory,
          historyIds,
          historyIds.length - 1
        );
        const toIndex = historyIds.indexOf(toId);
        fromId = await this.findAvailableEntry(laneDiffGenerator, laneObj, laneHistory, historyIds, toIndex - 1);
      }
    }

    const laneDiffGenerator = new LaneDiffGenerator(this.workspace, this.scope, this.componentCompare);
    const results = await laneDiffGenerator.generateDiffHistory(laneObj, laneHistory, fromId, toId, pattern);
    return laneDiffGenerator.laneDiffResultsToString(results);
  }

  /**
   * Walk backwards from `startIndex` through `historyIds` to find the first entry
   * whose version objects are available (exist on the remote / locally).
   */
  private async findAvailableEntry(
    laneDiffGenerator: LaneDiffGenerator,
    laneObj: NonNullable<Awaited<ReturnType<LanesMain['loadLane']>>>,
    laneHistory: Awaited<ReturnType<LanesMain['getLaneHistory']>>,
    historyIds: string[],
    startIndex: number
  ): Promise<string> {
    for (let i = startIndex; i >= 0; i--) {
      const available = await laneDiffGenerator.isHistoryEntryAvailable(laneObj, laneHistory, historyIds[i]);
      if (available) return historyIds[i];
    }
    throw new BitError(
      `unable to find a history entry with available version objects. all entries before index ${startIndex} have orphaned versions`
    );
  }
}
