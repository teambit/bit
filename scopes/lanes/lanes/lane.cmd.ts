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

    const results = await this.lanes.getLanes({
      remote,
      merged,
      notMerged,
    });
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
      return currentLane ? `${currentLane}\n` : '';
    }

    function outputAvailableLanes() {
      if (!availableLanes) return '';
      return remote ? `${availableLanes}\n` : `\nAvailable lanes:\n${availableLanes}\n`;
    }
  }
  async json(args, laneOptions: LaneOptions) {
    const { remote, merged = false, notMerged = false } = laneOptions;

    const results = await this.lanes.getLanes({
      remote,
      showDefaultLane: true,
      merged,
      notMerged,
    });
    return results;
  }
}

export class LaneShowCmd implements Command {
  name = 'show <name>';
  description = `show lane details`;
  alias = '';
  options = [
    ['j', 'json', 'show lanes details in json format'],
    ['r', 'remote <string>', 'show remote lanes'],
  ] as CommandOptions;
  loader = true;
  private = true;
  migration = true;
  remoteOp = true;
  skipWorkspace = true;

  constructor(private lanes: LanesMain, private workspace: Workspace, private scope: ScopeMain) {}

  async report([name]: [string], laneOptions: LaneOptions): Promise<string> {
    const { remote, json = false } = laneOptions;

    if (!this.workspace) {
      if (!this.scope) throw new Error(`lane command needs to be run within a workspace or a scope`);
      const scopeLanes = await this.scope.legacyScope.listLanes();
      return scopeLanes.map((l) => l.name).join('\n');
    }

    const results = await this.lanes.getLanes({
      name,
      remote,
      showDefaultLane: json,
    });
    if (json) return JSON.stringify(results, null, 2);

    const onlyLane = results.lanes[0];
    const title = `showing information for ${chalk.bold(name)}${outputRemoteLane(onlyLane.remote)}\n`;
    return title + outputComponents(onlyLane.components);
  }

  async json([name]: [string], laneOptions: LaneOptions) {
    const { remote, json = false } = laneOptions;

    if (!this.workspace) {
      if (!this.scope) throw new Error(`lane command needs to be run within a workspace or a scope`);
      const scopeLanes = await this.scope.legacyScope.listLanes();
      return scopeLanes;
    }

    const results = await this.lanes.getLanes({
      name,
      remote,
      showDefaultLane: json,
    });
    return results;
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
