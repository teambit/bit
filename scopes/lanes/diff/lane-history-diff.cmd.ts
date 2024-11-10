import { Command, CommandOptions } from '@teambit/cli';
import { ScopeMain } from '@teambit/scope';
import { Workspace } from '@teambit/workspace';
import { ComponentCompareMain } from '@teambit/component-compare';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy/dist/constants';
import { LaneDiffGenerator } from './lane-diff-generator';
import { BitError } from '@teambit/bit-error';
import { LanesMain } from '@teambit/lanes';

export class LaneHistoryDiffCmd implements Command {
  name = 'history-diff <from-history-id> <to-history-id>';
  description = 'EXPERIMENTAL. show diff between two lane-history ids';
  extendedDescription = 'run "bit lane history" to find these history-ids';
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
    [fromHistoryId, toHistoryId]: [string, string],
    { lane, pattern }: { lane?: string; pattern?: string }
  ): Promise<string> {
    const laneId = lane ? await this.lanes.parseLaneId(lane) : this.lanes.getCurrentLaneId();
    if (!laneId || laneId.isDefault()) throw new BitError(`unable to show diff-history of the default lane (main)`);
    await this.lanes.importLaneHistory(laneId);
    const laneHistory = await this.lanes.getLaneHistory(laneId);
    const laneDiffGenerator = new LaneDiffGenerator(this.workspace, this.scope, this.componentCompare);
    const laneObj = await this.lanes.loadLane(laneId);
    const results = await laneDiffGenerator.generateDiffHistory(
      laneObj!,
      laneHistory,
      fromHistoryId,
      toHistoryId,
      pattern
    );
    return laneDiffGenerator.laneDiffResultsToString(results);
  }
}
