import chalk from 'chalk';
import Command from '../../command';
import { BASE_DOCS_DOMAIN } from '../../../constants';
import { lane } from '../../../api/consumer';
import { LaneResults, LaneData } from '../../../api/consumer/lib/lane';

export default class Lane extends Command {
  name = 'lane [name]';
  description = `show lanes details
  https://${BASE_DOCS_DOMAIN}/docs/lanes`;
  alias = '';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  opts = [
    ['d', 'details', 'show more details on the state of each component in each lane'],
    ['j', 'json', 'show lanes details in json format'],
    ['', 'merged', 'show merged lanes'],
    ['', 'not-merged', 'show not merged lanes']
  ];
  loader = true;
  migration = true;

  action(
    [name]: string[],
    {
      details = false,
      merged = false,
      notMerged = false,
      json = false
    }: {
      details: boolean;
      merged: boolean;
      notMerged: boolean;
      json: boolean;
    }
  ): Promise<any> {
    return lane({
      name,
      showDefaultLane: json,
      merged,
      notMerged
    }).then(results => ({ results, details, json, name }));
  }

  report({
    results,
    details,
    json,
    name
  }: {
    results: LaneResults;
    details: boolean;
    json: boolean;
    name?: string;
  }): string {
    if (!results.lanes) {
      if (results.merged) {
        if (!results.merged.length) return chalk.green('None of the lanes is merged');
        return chalk.green(results.merged.join('\n'));
      }
      if (results.notMerged) {
        if (!results.notMerged.length) return chalk.green('All lanes are merged');
        return chalk.green(results.notMerged.join('\n'));
      }
      throw new Error('unknown bit-lane flags combination');
    }
    if (json) return JSON.stringify(results, null, 2);
    if (name) {
      const onlyLane = results.lanes[0];
      const title = `showing information for ${chalk.bold(name)}${outputRemoteLane(onlyLane.remote)}\n`;
      const components = outputComponents(onlyLane.components);
      return title + components;
    }
    let currentLane = `current lane - ${chalk.bold(results.currentLane as string)}`;
    if (details) {
      const laneDataOfCurrentLane = results.lanes.find(l => l.name === results.currentLane);
      const remoteOfCurrentLane = laneDataOfCurrentLane ? laneDataOfCurrentLane.remote : null;
      const currentLaneComponents = laneDataOfCurrentLane ? outputComponents(laneDataOfCurrentLane.components) : '';
      currentLane += `${outputRemoteLane(remoteOfCurrentLane)}\n${currentLaneComponents}`;
    }

    const availableLanes = results.lanes
      .filter(l => l.name !== results.currentLane)
      // @ts-ignore
      .map(laneData => {
        if (details) {
          const laneTitle = `> ${chalk.green(laneData.name)}${outputRemoteLane(laneData.remote)}\n`;
          const components = outputComponents(laneData.components);
          return laneTitle + components;
        }
        return `    > ${chalk.green(laneData.name)} (${laneData.components.length} components)`;
      })
      .join('\n');
    const footer = details
      ? `switch lanes using 'bit switch <name>'.
You can use --merge and --no-merge to see which of the lanes is fully merged.`
      : `to get more info on all lanes in workspace use 'bit lane --details' or 'bit lane <lane-name>' for a specific lane.
switch lanes using 'bit switch <name>'.`;
    const availableLanesStr = availableLanes ? `\nAvailable lanes:\n${availableLanes}\n` : '';
    return `${currentLane}\n${availableLanesStr}\n${footer}`;

    function outputComponents(components: LaneData['components']): string {
      const title = `\tcomponents (${components.length})\n`;
      const componentsStr = components.map(c => `\t  ${c.id.toString()} - ${c.head}`).join('\n');
      return title + componentsStr;
    }

    function outputRemoteLane(remoteLane: string | null | undefined): string {
      if (!remoteLane) return '';
      return ` - (remote lane - ${remoteLane})`;
    }
  }
}
