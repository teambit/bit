import chalk from 'chalk';

import { lane } from '../../../api/consumer';
import { LaneResults } from '../../../api/consumer/lib/lane';
import { BASE_DOCS_DOMAIN } from '../../../constants';
import { LaneData } from '../../../scope/lanes/lanes';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class Lane implements LegacyCommand {
  name = 'lane [name]';
  description = `show lanes details
  https://${BASE_DOCS_DOMAIN}/docs/lanes`;
  alias = '';
  opts = [
    ['d', 'details', 'show more details on the state of each component in each lane'],
    ['j', 'json', 'show lanes details in json format'],
    ['r', 'remote <string>', 'show remote lanes'],
    ['', 'merged', 'show merged lanes'],
    ['', 'not-merged', 'show not merged lanes'],
  ] as CommandOptions;
  loader = true;
  private = true;
  migration = true;
  remoteOp = true;
  skipWorkspace = true;

  action(
    [name]: string[],
    {
      details = false,
      remote,
      merged = false,
      notMerged = false,
      json = false,
    }: {
      details: boolean;
      remote?: string;
      merged: boolean;
      notMerged: boolean;
      json: boolean;
    }
  ): Promise<any> {
    return lane({
      name,
      remote,
      showDefaultLane: json,
      merged,
      notMerged,
    }).then((results) => ({ results, details, json, name, merged, notMerged, remote }));
  }

  report({
    results,
    details,
    json,
    name,
    merged,
    notMerged,
    remote,
  }: {
    results: LaneResults;
    details: boolean;
    json: boolean;
    name?: string;
    merged: boolean;
    notMerged: boolean;
    remote?: string;
  }): string {
    if (json) return JSON.stringify(results, null, 2);
    if (merged) {
      const mergedLanes = results.lanes.filter((l) => l.isMerged);
      if (!mergedLanes.length) return chalk.green('None of the lanes is merged');
      return chalk.green(mergedLanes.map((m) => m.name).join('\n'));
    }
    if (notMerged) {
      const unmergedLanes = results.lanes.filter((l) => !l.isMerged);
      if (!unmergedLanes.length) return chalk.green('All lanes are merged');
      return chalk.green(unmergedLanes.map((m) => m.name).join('\n'));
    }
    if (name) {
      const onlyLane = results.lanes[0];
      const title = `showing information for ${chalk.bold(name)}${outputRemoteLane(onlyLane.remote)}\n`;
      const components = outputComponents(onlyLane.components);
      return title + components;
    }
    let currentLane = results.currentLane ? `current lane - ${chalk.bold(results.currentLane as string)}` : '';
    if (details) {
      const laneDataOfCurrentLane = results.lanes.find((l) => l.name === results.currentLane);
      const remoteOfCurrentLane = laneDataOfCurrentLane ? laneDataOfCurrentLane.remote : null;
      const currentLaneComponents = laneDataOfCurrentLane ? outputComponents(laneDataOfCurrentLane.components) : '';
      if (currentLane) {
        currentLane += `${outputRemoteLane(remoteOfCurrentLane)}\n${currentLaneComponents}`;
      }
    }

    const availableLanes = results.lanes
      .filter((l) => l.name !== results.currentLane)
      // @ts-ignore
      .map((laneData) => {
        if (details) {
          const laneTitle = `> ${chalk.green(laneData.name)}${outputRemoteLane(laneData.remote)}\n`;
          const components = outputComponents(laneData.components);
          return laneTitle + components;
        }
        return `    > ${chalk.green(laneData.name)} (${laneData.components.length} components)`;
      })
      .join('\n');

    return outputCurrentLane() + outputAvailableLanes() + outputFooter();

    function outputComponents(components: LaneData['components']): string {
      const title = `\tcomponents (${components.length})\n`;
      const componentsStr = components.map((c) => `\t  ${c.id.toString()} - ${c.head}`).join('\n');
      return title + componentsStr;
    }

    function outputRemoteLane(remoteLane: string | null | undefined): string {
      if (!remoteLane) return '';
      return ` - (remote lane - ${remoteLane})`;
    }

    function outputCurrentLane() {
      return currentLane ? `${currentLane}\n` : '';
    }

    function outputAvailableLanes() {
      if (!availableLanes) return '';
      return remote ? `${availableLanes}\n` : `\nAvailable lanes:\n${availableLanes}\n`;
    }

    function outputFooter() {
      let footer = '\n';
      if (details) {
        footer += 'You can use --merged and --not-merged to see which of the lanes is fully merged.';
      } else {
        footer +=
          "to get more info on all lanes in workspace use 'bit lane --details' or 'bit lane <lane-name>' for a specific lane.";
      }
      if (!remote) footer += `\nswitch lanes using 'bit switch <name>'.`;

      return footer;
    }
  }
}
