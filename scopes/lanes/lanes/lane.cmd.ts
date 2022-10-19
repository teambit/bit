// eslint-disable-next-line max-classes-per-file
import chalk from 'chalk';
import yn from 'yn';
import { ScopeMain } from '@teambit/scope';
import { LaneId } from '@teambit/lane-id';
import { Workspace } from '@teambit/workspace';
import { Command, CommandOptions } from '@teambit/cli';
import { LaneData } from '@teambit/legacy/dist/scope/lanes/lanes';
import { BitError } from '@teambit/bit-error';
import { approveOperation } from '@teambit/legacy/dist/prompts';
import { CreateLaneOptions, LanesMain } from './lanes.main.runtime';
import { SwitchCmd } from './switch.cmd';

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
    ['j', 'json', 'show lanes details in a json format'],
    ['r', 'remote <remote-scope-name>', 'show remote lanes'],
    ['', 'merged', 'show merged lanes'],
    ['', 'not-merged', 'show lanes that are not merged'],
  ] as CommandOptions;
  loader = true;
  private = true;
  migration = true;
  remoteOp = true;
  skipWorkspace = true;

  constructor(private lanes: LanesMain, private workspace: Workspace, private scope: ScopeMain) {}

  async report(args, laneOptions: LaneOptions): Promise<string> {
    const { details, remote, merged, notMerged } = laneOptions;
    const laneIdStr = (laneId: LaneId, alias?: string | null) => {
      if (laneId.isDefault()) return laneId.name;
      if (alias) return `${laneId.toString()} (${alias})`;
      return laneId.toString();
    };
    const lanes = await this.lanes.getLanes({
      remote,
      merged,
      notMerged,
      showDefaultLane: true,
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
    const currentLane = this.lanes.getCurrentLaneId() || this.lanes.getDefaultLaneId();
    const laneDataOfCurrentLane = currentLane ? lanes.find((l) => currentLane.isEqual(l.id)) : undefined;
    const currentAlias = laneDataOfCurrentLane ? laneDataOfCurrentLane.alias : undefined;
    const currentLaneReadmeComponentStr = outputReadmeComponent(laneDataOfCurrentLane?.readmeComponent);
    let currentLaneStr = `current lane - ${chalk.green.green(laneIdStr(currentLane, currentAlias))}`;
    currentLaneStr += currentLaneReadmeComponentStr;

    if (details) {
      const currentLaneComponents = laneDataOfCurrentLane ? outputComponents(laneDataOfCurrentLane.components) : '';
      if (currentLaneStr) {
        currentLaneStr += `\n${currentLaneComponents}`;
      }
    }

    const availableLanes = lanes
      .filter((l) => !currentLane.isEqual(l.id))
      .map((laneData) => {
        const readmeComponentStr = outputReadmeComponent(laneData.readmeComponent);
        if (details) {
          const laneTitle = `> ${chalk.bold(laneIdStr(laneData.id, laneData.alias))}\n`;
          const components = outputComponents(laneData.components);
          return laneTitle + readmeComponentStr.concat('\n') + components;
        }
        return `    > ${chalk.green(laneIdStr(laneData.id, laneData.alias))} (${
          laneData.components.length
        } components)${readmeComponentStr}`;
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
    const currentLane = this.lanes.getCurrentLaneNameOrAlias();
    return { lanes, currentLane };
  }
}

export class LaneShowCmd implements Command {
  name = 'show <lane-name>';
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
    const title = `showing information for ${chalk.bold(onlyLane.id.toString())}\n`;
    const author = `author: ${onlyLane.log?.username || 'N/A'} <${onlyLane.log?.email || 'N/A'}>\n`;
    const date = onlyLane.log?.date ? `${new Date(parseInt(onlyLane.log.date)).toLocaleString()}\n` : undefined;
    return title + author + date + outputComponents(onlyLane.components);
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

export class LaneCreateCmd implements Command {
  name = 'create <lane-name>';
  arguments = [
    {
      name: 'lane-name',
      description: 'the name for the new lane',
    },
  ];
  description = `creates a new lane and switches to it`;
  extendedDescription = `a lane created from main (default-lane) is empty until components are snapped.
a lane created from another lane has all the components of the original lane.`;
  alias = '';
  options = [
    [
      '',
      'remote-scope <scope-name>',
      'remote scope where this lane will be exported to, default to the defaultScope (can be changed later with "bit lane change-scope")',
    ],
    [
      '',
      'alias <name>',
      'a local alias to refer to this lane, defaults to the <lane-name> (can be added later with "bit lane alias")',
    ],
  ] as CommandOptions;
  loader = true;
  private = true;
  migration = true;

  constructor(private lanes: LanesMain) {}

  async report([name]: [string], createLaneOptions: CreateLaneOptions): Promise<string> {
    const result = await this.lanes.createLane(name, createLaneOptions);
    const remoteScopeOrDefaultScope = createLaneOptions.remoteScope
      ? `the remote scope ${chalk.bold(createLaneOptions.remoteScope)}`
      : `the default-scope ${chalk.bold(result.remoteScope)}. to change it, please run "bit lane change-scope" command`;
    const title = chalk.green(`successfully added and checked out to a new lane ${chalk.bold(result.localLane)}`);
    const remoteScopeOutput = `this lane will be exported to ${remoteScopeOrDefaultScope}`;
    return `${title}\n${remoteScopeOutput}`;
  }
}

export class LaneAliasCmd implements Command {
  name = 'alias <lane-name> <alias>';
  description = 'adds an alias to a lane';
  extendedDescription = `an alias is a name that can be used to refer to a lane. it is saved locally and never reach the remote.
it is useful when having multiple lanes with the same name, but with different remote scopes.`;
  alias = '';
  options = [] as CommandOptions;
  loader = true;
  private = true;
  migration = true;

  constructor(private lanes: LanesMain) {}

  async report([laneName, alias]: [string, string, string]): Promise<string> {
    const { laneId } = await this.lanes.aliasLane(laneName, alias);
    return `successfully added the alias ${chalk.bold(alias)} to the lane ${chalk.bold(laneId.toString())}`;
  }
}

export class LaneChangeScopeCmd implements Command {
  name = 'change-scope <lane-name> <remote-scope-name>';
  description = `changes the remote scope of a lane`;
  alias = '';
  options = [] as CommandOptions;
  loader = true;
  private = true;
  migration = true;

  constructor(private lanes: LanesMain) {}

  async report([localName, remoteScope]: [string, string]): Promise<string> {
    const { remoteScopeBefore } = await this.lanes.changeScope(localName, remoteScope);
    return `the remote-scope of ${chalk.bold(localName)} has been changed from ${chalk.bold(
      remoteScopeBefore
    )} to ${chalk.bold(remoteScope)}`;
  }
}

export class LaneRenameCmd implements Command {
  name = 'rename <current-name> <new-name>';
  description = `EXPERIMENTAL. change the lane-name locally and on the remote (if exported)`;
  alias = '';
  options = [] as CommandOptions;
  loader = true;
  private = true;
  migration = true;

  constructor(private lanes: LanesMain) {}

  async report([currentName, newName]: [string, string]): Promise<string> {
    const { exported, exportErr } = await this.lanes.rename(currentName, newName);
    const exportedStr = exported
      ? `and have been exported successfully to the remote`
      : `however if failed to export the renamed lane to the remote, due to an error: ${
          exportErr?.message || 'unknown'
        }`;
    return `the lane ${chalk.bold(currentName)} has been changed to ${chalk.bold(newName)}, ${exportedStr}`;
  }
}

export class LaneRemoveCmd implements Command {
  name = 'remove <lanes...>';
  arguments = [{ name: 'lanes...', description: 'A list of lane names, separated by spaces' }];
  description = `remove lanes`;
  alias = '';
  options = [
    ['r', 'remote', 'remove a remote lane (in the lane arg, use remote/lane-id syntax)'],
    ['f', 'force', 'removes the lane even when the lane was not merged yet'],
    ['s', 'silent', 'skip confirmation'],
  ] as CommandOptions;
  loader = true;
  private = true;
  migration = true;

  constructor(private lanes: LanesMain) {}

  async report(
    [names]: [string[]],
    {
      remote = false,
      force = false,
      silent = false,
    }: {
      remote: boolean;
      force: boolean;
      silent: boolean;
    }
  ): Promise<string> {
    if (!silent) {
      const removePromptResult = await approveOperation();
      // @ts-ignore
      if (!yn(removePromptResult.shouldProceed)) {
        throw new BitError('the operation has been canceled');
      }
    }
    const laneResults = await this.lanes.removeLanes(names, { remote, force });
    return chalk.green(`successfully removed the following lane(s): ${chalk.bold(laneResults.join(', '))}`);
  }
}

export class LaneImportCmd implements Command {
  name = 'import <lane>';
  description = `import a remote lane to your workspace`;
  arguments = [{ name: 'lane', description: 'the remote lane name' }];
  alias = '';
  options = [
    ['', 'skip-dependency-installation', 'do not install packages of the imported components'],
  ] as CommandOptions;
  loader = true;
  private = true;
  migration = true;

  constructor(private switchCmd: SwitchCmd) {}

  async report(
    [lane]: [string],
    { skipDependencyInstallation = false }: { skipDependencyInstallation: boolean }
  ): Promise<string> {
    return this.switchCmd.report([lane], { getAll: true, skipDependencyInstallation });
  }
}

export class LaneCmd implements Command {
  name = 'lane [lane-name]';
  description = 'show lanes details';
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

  constructor(private lanes: LanesMain, private workspace: Workspace, private scope: ScopeMain, docsDomain: string) {
    this.description = `show lanes details
https://${docsDomain}/components/lanes`;
  }

  async report([name]: [string], laneOptions: LaneOptions): Promise<string> {
    return new LaneListCmd(this.lanes, this.workspace, this.scope).report([name], laneOptions);
  }
}

export class LaneRemoveReadmeCmd implements Command {
  name = 'remove-readme [laneName]';
  description = 'EXPERIMENTAL. remove lane readme component';
  options = [] as CommandOptions;
  loader = true;
  private = true;
  skipWorkspace = false;

  constructor(private lanes: LanesMain) {}

  async report([laneName]: [string]): Promise<string> {
    const { result, message } = await this.lanes.removeLaneReadme(laneName);

    if (result) {
      return chalk.green(
        `the readme component has been successfully removed from the lane ${
          laneName || this.lanes.getCurrentLaneName()
        }`
      );
    }

    return chalk.red(`${message}\n`);
  }
}

export class LaneAddReadmeCmd implements Command {
  name = 'add-readme <component-name> [lane-name]';
  description = 'EXPERIMENTAL. adds a readme component to a lane';
  arguments = [
    { name: 'component-id', description: "the component name or id of the component to use as the lane's readme" },
    { name: 'lane-name', description: 'the lane to attach the readme to (defaults to the current lane)' },
  ];
  options = [] as CommandOptions;
  loader = true;
  private = true;
  skipWorkspace = false;

  constructor(private lanes: LanesMain) {}

  async report([componentId, laneName]: [string, string]): Promise<string> {
    const { result, message } = await this.lanes.addLaneReadme(componentId, laneName);

    if (result)
      return chalk.green(
        `the component ${componentId} has been successfully added as the readme component for the lane ${
          laneName || this.lanes.getCurrentLaneName()
        }`
      );

    return chalk.red(
      `${message || ''}\nthe component ${componentId} could not be added as a readme component for the lane ${
        laneName || this.lanes.getCurrentLaneName()
      }`
    );
  }
}

function outputComponents(components: LaneData['components']): string {
  const componentsTitle = `\t${chalk.bold(`components (${components.length})`)}\n`;
  const componentsStr = components.map((c) => `\t  ${c.id.toString()} - ${c.head}`).join('\n');
  return componentsTitle + componentsStr;
}

function outputReadmeComponent(component: LaneData['readmeComponent']): string {
  if (!component) return '';
  return `\n\t${`${chalk.yellow('readme component')}\n\t  ${component.id} - ${
    component.head ||
    `(unsnapped)\n\t("use bit snap ${component.id.name}" to snap the readme component on the lane before exporting)`
  }`}\n`;
}
