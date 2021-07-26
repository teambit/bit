// eslint-disable-next-line max-classes-per-file
import chalk from 'chalk';
import { ScopeMain } from '@teambit/scope';
import { Workspace } from '@teambit/workspace';
import { Command, CommandOptions } from '@teambit/cli';
import { BASE_DOCS_DOMAIN } from '@teambit/legacy/dist/constants';
import { LaneData } from '@teambit/legacy/dist/scope/lanes/lanes';
import { LanesMain } from './lanes.main.runtime';

type LaneOptions = {
  details?: boolean;
  remote?: string;
  merged?: boolean;
  notMerged?: boolean;
  json?: boolean;
};

export class LaneListCmd implements Command {
  name = 'list';
  description = `list lanes`;
  alias = '';
  options = [
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

  constructor(private lanes: LanesMain, private workspace: Workspace, private scope: ScopeMain) {}

  async report(args, laneOptions: LaneOptions): Promise<string> {
    const { details, remote, merged, notMerged } = laneOptions;

    const lanes = await this.lanes.getLanes({
      remote,
      merged,
      notMerged,
    });
    if (merged) {
      const mergedLanes = lanes.filter((l) => l.isMerged);
      if (!mergedLanes.length) return chalk.green('None of the lanes is merged');
      return chalk.green(mergedLanes.map((m) => m.name).join('\n'));
    }
    if (notMerged) {
      const unmergedLanes = lanes.filter((l) => !l.isMerged);
      if (!unmergedLanes.length) return chalk.green('All lanes are merged');
      return chalk.green(unmergedLanes.map((m) => m.name).join('\n'));
    }
    const currentLane = this.lanes.getCurrentLane();
    let currentLaneStr = currentLane ? `current lane - ${chalk.bold(currentLane as string)}` : '';
    if (details) {
      const laneDataOfCurrentLane = lanes.find((l) => l.name === currentLane);
      const remoteOfCurrentLane = laneDataOfCurrentLane ? laneDataOfCurrentLane.remote : null;
      const currentLaneComponents = laneDataOfCurrentLane ? outputComponents(laneDataOfCurrentLane.components) : '';
      if (currentLaneStr) {
        currentLaneStr += `${outputRemoteLane(remoteOfCurrentLane)}\n${currentLaneComponents}`;
      }
    }

    const availableLanes = lanes
      .filter((l) => l.name !== currentLane)
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

    const outputFooter = () => {
      let footer = '\n';
      if (details) {
        footer += 'You can use --merged and --not-merged to see which of the lanes is fully merged.';
      } else {
        footer +=
          "to get more info on all lanes in workspace use 'bit lane list --details' or 'bit lane show <lane-name>' for a specific lane.";
      }
      if (!remote && this.workspace) footer += `\nswitch lanes using 'bit switch <name>'.`;

      return footer;
    };

    return outputCurrentLane() + outputAvailableLanes() + outputFooter();

    function outputCurrentLane() {
      return currentLaneStr ? `${currentLaneStr}\n` : '';
    }

    function outputAvailableLanes() {
      if (!availableLanes) return '';
      return remote ? `${availableLanes}\n` : `\nAvailable lanes:\n${availableLanes}\n`;
    }
  }
  async json(args, laneOptions: LaneOptions) {
    const { remote, merged = false, notMerged = false } = laneOptions;

    const lanes = await this.lanes.getLanes({
      remote,
      showDefaultLane: true,
      merged,
      notMerged,
    });
    const currentLane = this.lanes.getCurrentLane();
    return { lanes, currentLane };
  }
}

export class LaneShowCmd implements Command {
  name = 'show <name>';
  description = `show lane details`;
  alias = '';
  options = [
    ['j', 'json', 'show the lane details in json format'],
    ['r', 'remote <string>', 'show remote lanes'],
  ] as CommandOptions;
  loader = true;
  private = true;
  migration = true;
  remoteOp = true;
  skipWorkspace = true;

  constructor(private lanes: LanesMain, private workspace: Workspace, private scope: ScopeMain) {}

  async report([name]: [string], laneOptions: LaneOptions): Promise<string> {
    const { remote } = laneOptions;

    const lanes = await this.lanes.getLanes({
      name,
      remote,
    });

    const onlyLane = lanes[0];
    const title = `showing information for ${chalk.bold(name)}${outputRemoteLane(onlyLane.remote)}\n`;
    return title + outputComponents(onlyLane.components);
  }

  async json([name]: [string], laneOptions: LaneOptions) {
    const { remote } = laneOptions;

    const lanes = await this.lanes.getLanes({
      name,
      remote,
    });
    return lanes[0];
  }
}

export class LaneCmd implements Command {
  name = 'lane [name]';
  shortDescription = 'show lanes details';
  description = `show lanes details
https://${BASE_DOCS_DOMAIN}/docs/lanes`;
  alias = '';
  options = [
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
  commands: Command[] = [];

  constructor(private lanes: LanesMain, private workspace: Workspace, private scope: ScopeMain) {}

  async report([name]: [string], laneOptions: LaneOptions): Promise<string> {
    return new LaneListCmd(this.lanes, this.workspace, this.scope).report([name], laneOptions);
  }
}

function outputComponents(components: LaneData['components']): string {
  const componentsTitle = `\tcomponents (${components.length})\n`;
  const componentsStr = components.map((c) => `\t  ${c.id.toString()} - ${c.head}`).join('\n');
  return componentsTitle + componentsStr;
}

function outputRemoteLane(remoteLane: string | null | undefined): string {
  if (!remoteLane) return '';
  return ` - (remote lane - ${remoteLane})`;
}
