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
with two arguments - diff between two specific history entries (first=from, second=to)
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

    if (historyId && toHistoryId) {
      // two args: explicit from and to (backward compatible)
      fromId = historyId;
      toId = toHistoryId;
    } else if (historyId) {
      // one arg: diff this snap against its predecessor
      toId = historyId;
      const predecessorIndex = historyIds.indexOf(historyId) - 1;
      if (predecessorIndex < 0)
        throw new BitError(
          `unable to find a predecessor for history-id "${historyId}". it's either the first entry or not found`
        );
      fromId = historyIds[predecessorIndex];
    } else {
      // no args: diff the latest snap against the one before it
      if (historyIds.length < 2)
        throw new BitError(`need at least two history entries to diff, got ${historyIds.length}`);
      toId = historyIds[historyIds.length - 1];
      fromId = historyIds[historyIds.length - 2];
    }

    const laneDiffGenerator = new LaneDiffGenerator(this.workspace, this.scope, this.componentCompare);
    const laneObj = await this.lanes.loadLane(laneId);
    const results = await laneDiffGenerator.generateDiffHistory(laneObj!, laneHistory, fromId, toId, pattern);
    return laneDiffGenerator.laneDiffResultsToString(results);
  }
}
