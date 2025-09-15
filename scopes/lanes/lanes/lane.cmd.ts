// eslint-disable-next-line max-classes-per-file
import chalk from 'chalk';
import yn from 'yn';
import type { ScopeMain } from '@teambit/scope';
import type { LaneId } from '@teambit/lane-id';
import { DEFAULT_LANE } from '@teambit/lane-id';
import { checkoutOutput } from '@teambit/checkout';
import type { Workspace } from '@teambit/workspace';
import { OutsideWorkspaceError } from '@teambit/workspace';
import type { Command, CommandOptions } from '@teambit/cli';
import type { LaneData } from '@teambit/legacy.scope';
import { serializeLaneData } from '@teambit/legacy.scope';
import { BitError } from '@teambit/bit-error';
import { approveOperation } from '@teambit/legacy.cli.prompts';
import { COMPONENT_PATTERN_HELP, DEFAULT_CLOUD_DOMAIN } from '@teambit/legacy.constants';
import type { CreateLaneOptions, LanesMain } from './lanes.main.runtime';
import type { SwitchCmd } from './switch.cmd';
import type { FetchCmd } from '@teambit/importer';

type LaneOptions = {
  details?: boolean;
  remote?: string;
  merged?: boolean;
  notMerged?: boolean;
  json?: boolean;
};

export class LaneListCmd implements Command {
  name = 'list';
  description = `list local or remote lanes`;
  alias = '';
  options = [
    ['d', 'details', 'show more details on the state of each component in each lane'],
    ['j', 'json', "show lanes' details in a json format"],
    ['r', 'remote <remote-scope-name>', 'show all remote lanes from the specified scope'],
    ['', 'merged', 'list only merged lanes'],
    ['', 'not-merged', "list only lanes that haven't been merged"],
  ] as CommandOptions;
  loader = true;
  remoteOp = true;
  skipWorkspace = true;

  constructor(
    private lanes: LanesMain,
    private workspace: Workspace,
    private scope: ScopeMain
  ) {}

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
    let currentLaneStr = remote
      ? ''
      : `current lane - ${chalk.green.green(laneIdStr(currentLane, currentAlias))}${currentLaneReadmeComponentStr}`;

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
          "to get more info on all lanes in local scope use 'bit lane list --details', or 'bit lane show <lane-name>' for a specific lane.";
      }
      if (!remote && this.workspace)
        footer += `\nswitch lanes using 'bit switch <name>'. create lanes using 'bit lane create <name>'.`;

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

    const lanesData = await this.lanes.getLanes({
      remote,
      showDefaultLane: true,
      merged,
      notMerged,
    });
    const lanes = lanesData.map(serializeLaneData);
    const currentLane = this.lanes.getCurrentLaneNameOrAlias();
    return { lanes, currentLane };
  }
}

export class LaneShowCmd implements Command {
  name = 'show [lane-name]';
  description = `show lane details. if no lane specified, show the current lane`;
  alias = '';
  options = [
    ['j', 'json', 'show the lane details in json format'],
    ['r', 'remote', 'show details of the remote head of the provided lane'],
  ] as CommandOptions;
  loader = true;
  remoteOp = true;
  skipWorkspace = true;

  constructor(
    private lanes: LanesMain,
    private workspace: Workspace,
    private scope: ScopeMain
  ) {}

  async report([name]: [string], laneOptions: LaneOptions): Promise<string> {
    const lanes = await this.geLanesData([name], laneOptions);
    const onlyLane = lanes[0];
    const laneId = onlyLane.id;
    const laneIdStr = laneId.isDefault() ? DEFAULT_LANE : laneId.toString();
    const title = `showing information for ${chalk.bold(laneIdStr)}\n`;
    const author = onlyLane.log ? `author: ${onlyLane.log?.username || 'N/A'} <${onlyLane.log?.email || 'N/A'}>\n` : '';
    const date = onlyLane.log?.date ? `created: ${new Date(parseInt(onlyLane.log.date)).toLocaleString()}\n` : '';
    const link = laneId.isDefault()
      ? ''
      : `link: https://${DEFAULT_CLOUD_DOMAIN}/${laneId.scope.replace('.', '/')}/~lane/${laneId.name}\n`;
    return title + author + date + link + outputComponents(onlyLane.components);
  }

  private async geLanesData([name]: [string], laneOptions: LaneOptions) {
    const { remote } = laneOptions;

    if (!name && remote) {
      throw new Error('remote flag is not supported without lane name');
    }
    if (!name) {
      name = this.lanes.getCurrentLaneName() || DEFAULT_LANE;
    }

    const laneId = await this.lanes.parseLaneId(name);

    const lanes = await this.lanes.getLanes({
      name: laneId.name,
      remote: remote ? laneId.scope : undefined,
    });

    return lanes;
  }

  async json([name]: [string], laneOptions: LaneOptions) {
    const lanes = await this.geLanesData([name], laneOptions);
    return serializeLaneData(lanes[0]);
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
a lane created from another lane contains all the components of the original lane.`;
  alias = '';
  options = [
    [
      's',
      'scope <scope-name>',
      'remote scope to which this lane will be exported, default to the workspace.json\'s defaultScope (can be changed up to first export of the lane with "bit lane change-scope")',
    ],
    ['', 'remote-scope <scope-name>', 'DEPRECATED. use --scope'],
    [
      '',
      'alias <name>',
      'a local alias to refer to this lane, defaults to the `<lane-name>` (can be added later with "bit lane alias")',
    ],
    [
      '',
      'fork-lane-new-scope',
      'create the new lane in a different scope than its parent lane (if created from another lane)',
    ],
  ] as CommandOptions;
  loader = true;

  constructor(private lanes: LanesMain) {}

  async report([name]: [string], createLaneOptions: CreateLaneOptions & { remoteScope?: string }): Promise<string> {
    if (!this.lanes.workspace) throw new OutsideWorkspaceError();
    const currentLane = await this.lanes.getCurrentLane();
    if (createLaneOptions.remoteScope) createLaneOptions.scope = createLaneOptions.remoteScope;
    const result = await this.lanes.createLane(name, createLaneOptions);
    const remoteScopeOrDefaultScope = createLaneOptions.scope
      ? `the remote scope ${chalk.bold(createLaneOptions.scope)}`
      : `the default-scope ${chalk.bold(
          result.laneId.scope
        )}. you can change the lane's scope, before it is exported, with the "bit lane change-scope" command`;
    const title = chalk.green(
      `successfully added and checked out to the new lane ${chalk.bold(result.alias || result.laneId.name)}
      ${currentLane ? chalk.yellow(`\nnote - your new lane will be based on lane ${currentLane.name}`) : ''}
      `
    );
    const remoteScopeOutput = `this lane will be exported to ${remoteScopeOrDefaultScope}`;
    return `${title}\n${remoteScopeOutput}`;
  }
}

export class LaneAliasCmd implements Command {
  name = 'alias <lane-name> <alias>';
  description = 'adds an alias to a lane';
  extendedDescription = `an alias is a name that can be used locally to refer to a lane. it is saved locally and never reaches the remote.
it is useful e.g. when having multiple lanes with the same name, but with different remote scopes.`;
  alias = '';
  options = [] as CommandOptions;
  loader = true;

  constructor(private lanes: LanesMain) {}

  async report([laneName, alias]: [string, string, string]): Promise<string> {
    const { laneId } = await this.lanes.aliasLane(laneName, alias);
    return `successfully added the alias ${chalk.bold(alias)} for lane ${chalk.bold(laneId.toString())}`;
  }
}

export class CatLaneHistoryCmd implements Command {
  name = 'cat-lane-history <lane-name>';
  description = 'cat lane-history object by lane-name';
  private = true;
  alias = 'clh';
  options = [] as CommandOptions;
  loader = true;
  group = 'advanced';

  constructor(private lanes: LanesMain) {}

  async report([laneName]: [string]): Promise<string> {
    const laneId = await this.lanes.parseLaneId(laneName);
    const laneHistory = await this.lanes.getLaneHistory(laneId);
    return JSON.stringify(laneHistory.toObject(), null, 2);
  }
}

export type LaneCheckoutOpts = { skipDependencyInstallation?: boolean };

export class LaneCheckoutCmd implements Command {
  name = 'checkout <history-id>';
  description = 'EXPERIMENTAL. checkout to a previous history of the current lane. see also "bit lane revert"';
  arguments = [
    { name: 'history-id', description: 'the history-id to checkout to. run "bit lane history" to list the ids' },
  ];
  alias = '';
  options = [
    ['x', 'skip-dependency-installation', 'do not install dependencies of the checked out components'],
  ] as CommandOptions;
  loader = true;

  constructor(private lanes: LanesMain) {}

  async report([historyId]: [string], opts: LaneCheckoutOpts): Promise<string> {
    const result = await this.lanes.checkoutHistory(historyId, opts);
    return checkoutOutput(result, {}, `successfully checked out according to history-id: ${historyId}`);
  }
}

export class LaneRevertCmd implements Command {
  name = 'revert <history-id>';
  description = 'EXPERIMENTAL. revert to a previous history of the current lane. see also "bit lane checkout"';
  extendedDescription = `revert is similar to "lane checkout", but it keeps the versions and only change the files.
choose one or the other based on your needs.
if you want to continue working on this lane and needs the changes from the history to be the head, then use "lane revert".
if you want to fork the lane from a certain point in history, use "lane checkout" and create a new lane from it.`;
  arguments = [
    { name: 'history-id', description: 'the history-id to checkout to. run "bit lane history" to list the ids' },
  ];
  alias = '';
  options = [
    ['x', 'skip-dependency-installation', 'do not install dependencies of the checked out components'],
    ['j', 'json', 'return the revert result in json format'],
  ] as CommandOptions;
  loader = true;

  constructor(private lanes: LanesMain) {}

  async report([historyId]: [string], opts: LaneCheckoutOpts): Promise<string> {
    const result = await this.lanes.revertHistory(historyId, opts);
    return checkoutOutput(result, {}, `successfully reverted according to history-id: ${historyId}`);
  }

  async json([historyId]: [string], opts: LaneCheckoutOpts) {
    const result = await this.lanes.revertHistory(historyId, opts);
    return {
      components: result.components?.map((component) => ({
        id: component.id.toString(),
        filesStatus: Object.entries(component.filesStatus || {}).reduce(
          (acc, [filePath, status]) => {
            acc[filePath] = status;
            return acc;
          },
          {} as Record<string, string>
        ),
      })),
      removedComponents: result.removedComponents?.map((id) => id.toString()),
      addedComponents: result.addedComponents?.map((id) => id.toString()),
      newComponents: result.newComponents?.map((id) => id.toString()),
      failedComponents: result.failedComponents?.map((component) => ({
        id: component.id.toString(),
        unchangedMessage: component.unchangedMessage,
        unchangedLegitimately: component.unchangedLegitimately,
      })),
      leftUnresolvedConflicts: result.leftUnresolvedConflicts,
      newFromLane: result.newFromLane,
      newFromLaneAdded: result.newFromLaneAdded,
      version: result.version,
      resolvedComponents: result.resolvedComponents?.map((component) => component.id.toString()),
      abortedComponents: result.abortedComponents?.map((component) => ({
        id: component.id.toString(),
        filesStatus: Object.entries(component.filesStatus || {}).reduce(
          (acc, [filePath, status]) => {
            acc[filePath] = status;
            return acc;
          },
          {} as Record<string, string>
        ),
      })),
      installationError: result.installationError?.message,
      compilationError: result.compilationError?.message,
      mergeSnapError: result.mergeSnapError?.message,
      mergeSnapResults: result.mergeSnapResults
        ? {
            snappedComponents: result.mergeSnapResults.snappedComponents?.map((component) => component.id.toString()),
            removedComponents: result.mergeSnapResults.removedComponents?.toStringArray(),
            exportedIds: result.mergeSnapResults.exportedIds?.map((id) => id.toString()),
          }
        : null,
      workspaceConfigUpdateResult: result.workspaceConfigUpdateResult
        ? {
            logs: result.workspaceConfigUpdateResult.logs,
          }
        : undefined,
      historyId,
    };
  }
}

export class LaneHistoryCmd implements Command {
  name = 'history [lane-name]';
  description = 'EXPERIMENTAL. show lane history, default to the current lane';
  extendedDescription = `list from the oldest to the newest history items`;
  alias = '';
  options = [
    ['', 'id <string>', 'show a specific history item'],
    ['j', 'json', 'return the lane history in json format'],
  ] as CommandOptions;
  loader = true;

  constructor(private lanes: LanesMain) {}

  private async getHistoryData(laneName?: string, id?: string) {
    const laneId = laneName ? await this.lanes.parseLaneId(laneName) : this.lanes.getCurrentLaneId();
    if (!laneId || laneId.isDefault()) throw new BitError(`unable to show history of the default lane (main)`);
    await this.lanes.importLaneHistory(laneId);
    const laneHistory = await this.lanes.getLaneHistory(laneId);
    const history = laneHistory.getHistory();

    if (id) {
      const historyItem = history[id];
      if (!historyItem) throw new Error(`history id ${id} was not found`);
      return { historyItem, id, history, singleItem: true };
    }

    return { history, singleItem: false };
  }

  private getDateString(date: string) {
    return new Date(parseInt(date)).toLocaleString();
  }

  async report([laneName]: [string], { id }: { id?: string }): Promise<string> {
    const { history, historyItem, singleItem } = await this.getHistoryData(laneName, id);

    if (singleItem && historyItem) {
      const date = this.getDateString(historyItem.log.date);
      const message = historyItem.log.message;
      return `${id} ${date} ${historyItem.log.username} ${message}\n\n${historyItem.components.join('\n')}`;
    }

    const items = Object.keys(history).map((uuid) => {
      const item = history[uuid];
      const date = this.getDateString(item.log.date);
      const message = item.log.message;
      return `${uuid} ${date} ${item.log.username} ${message}`;
    });
    return items.join('\n');
  }

  async json([laneName]: [string], { id }: { id?: string }) {
    const { history, historyItem, id: historyId, singleItem } = await this.getHistoryData(laneName, id);

    if (singleItem && historyItem) {
      return {
        id: historyId,
        date: historyItem.log.date,
        username: historyItem.log.username,
        message: historyItem.log.message,
        components: historyItem.components,
      };
    }

    return Object.keys(history).map((uuid) => {
      const item = history[uuid];
      return {
        id: uuid,
        date: item.log.date,
        username: item.log.username,
        message: item.log.message,
        components: item.components,
      };
    });
  }
}

export class LaneEjectCmd implements Command {
  name = 'eject <component-pattern>';
  description = `delete a component from the lane and install it as a package from main`;
  extendedDescription = `NOTE: unlike "bit eject" on main, this command doesn't only remove the component from the
workspace, but also mark it as deleted from the lane, so it won't be merged later on.`;
  alias = '';
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  options = [] as CommandOptions;
  loader = true;

  constructor(private lanes: LanesMain) {}

  async report([pattern]: [string]) {
    const results = await this.lanes.eject(pattern);
    const title = chalk.green('successfully ejected the following components');
    const body = results.map((r) => r.toString()).join('\n');
    return `${title}\n${body}`;
  }
}

export class LaneChangeScopeCmd implements Command {
  name = 'change-scope <remote-scope-name>';
  description = `changes the remote scope of a lane`;
  extendedDescription = 'NOTE: available only before the lane is exported to the remote';
  alias = '';
  options = [
    [
      'l',
      'lane-name <lane-name>',
      'the name of the lane to change its remote scope. if not specified, the current lane is used',
    ],
  ] as CommandOptions;
  loader = true;

  constructor(private lanes: LanesMain) {}

  async report([remoteScope]: [string], { laneName }: { laneName?: string }): Promise<string> {
    const { remoteScopeBefore, localName } = await this.lanes.changeScope(remoteScope, laneName);
    return `the remote-scope of ${chalk.bold(localName)} has been changed from ${chalk.bold(
      remoteScopeBefore
    )} to ${chalk.bold(remoteScope)}`;
  }
}

export class LaneRenameCmd implements Command {
  name = 'rename <new-name>';
  description = `change the lane-name locally`;
  extendedDescription = 'the remote will be updated after the next "bit export" command';
  alias = '';
  options = [
    ['l', 'lane-name <lane-name>', 'the name of the lane to rename. if not specified, the current lane is used'],
  ] as CommandOptions;
  loader = true;
  constructor(private lanes: LanesMain) {}

  async report([newName]: [string], { laneName }: { laneName?: string }): Promise<string> {
    const { currentName } = await this.lanes.rename(newName, laneName);
    return `the lane ${chalk.bold(currentName)}'s name has been changed to ${chalk.bold(newName)}.`;
  }
}

export class LaneRemoveCmd implements Command {
  name = 'remove <lanes...>';
  arguments = [{ name: 'lanes...', description: 'A list of lane names, separated by spaces' }];
  description = `remove or delete lanes`;
  group = 'collaborate';
  alias = '';
  options = [
    [
      'r',
      'remote',
      'delete a remote lane. use remote/lane-id syntax e.g. bit lane remove owner.org/my-lane --remote. Delete is immediate, no export required',
    ],
    ['f', 'force', 'removes/deletes the lane even when the lane is not yet merged to main'],
    ['s', 'silent', 'skip confirmation'],
  ] as CommandOptions;
  loader = true;

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
        throw new BitError('the operation has been cancelled');
      }
    }
    const laneResults = await this.lanes.removeLanes(names, { remote, force });
    return chalk.green(`successfully removed the following lane(s): ${chalk.bold(laneResults.join(', '))}`);
  }
}

export type RemoveCompsOpts = { workspaceOnly?: boolean; updateMain?: boolean };

export class LaneRemoveCompCmd implements Command {
  name = 'remove-comp <component-pattern>';
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  description = `DEPRECATED. remove components when on a lane`;
  group = 'collaborate';
  alias = 'rc';
  options = [
    [
      '',
      'workspace-only',
      'do not mark the components as removed from the lane. instead, remove them from the workspace only',
    ],
    [
      '',
      'update-main',
      'EXPERIMENTAL. remove, i.e. delete, component/s on the main lane after merging this lane into main',
    ],
  ] as CommandOptions;
  loader = true;

  constructor(
    private workspace: Workspace,
    private lanes: LanesMain
  ) {}

  async report(): Promise<string> {
    throw new BitError(`bit lane remove-comp has been removed. please use "bit remove" or "bit delete" instead`);
  }
}

export class LaneImportCmd implements Command {
  name = 'import <lane>';
  description = `import a remote lane to your workspace and switch to that lane`;
  arguments = [{ name: 'lane', description: 'the remote lane name' }];
  alias = '';
  options = [
    ['x', 'skip-dependency-installation', 'do not install dependencies of the imported components'],
    [
      'p',
      'pattern <component-pattern>',
      'import only components from the lane that fit the specified component-pattern to the workspace. works only when the workspace is empty',
    ],
    ['', 'branch', 'create and checkout a new git branch named after the lane'],
  ] as CommandOptions;
  loader = true;

  constructor(private switchCmd: SwitchCmd) {}

  async report(
    [lane]: [string],
    {
      skipDependencyInstallation = false,
      pattern,
      branch = false,
    }: {
      skipDependencyInstallation: boolean;
      pattern?: string;
      branch?: boolean;
    }
  ): Promise<string> {
    return this.switchCmd.report([lane], { skipDependencyInstallation, pattern, branch });
  }
}

export class LaneFetchCmd implements Command {
  name = 'fetch [lane-id]';
  description = `fetch component objects from lanes. if no lane-id is provided, it fetches from the current lane`;
  extendedDescription = `note, it does not save the remote lanes objects locally, only the refs`;
  alias = '';
  options = [['a', 'all', 'fetch all remote lanes']] as CommandOptions;
  loader = true;

  constructor(
    private fetchCmd: FetchCmd,
    private lanes: LanesMain
  ) {}

  async report([laneId]: [string], { all }: { all?: boolean }): Promise<string> {
    if (all) return this.fetchCmd.report([[]], { lanes: true });
    const getLaneIdStr = () => {
      if (laneId) return laneId;
      const currentLane = this.lanes.getCurrentLaneId();
      if (!currentLane || currentLane.isDefault())
        throw new BitError('you are not checked out to any lane. please specify a lane-id to fetch or use --all flag');
      return currentLane.toString();
    };
    const lane = getLaneIdStr();
    return this.fetchCmd.report([[lane]], { lanes: true });
  }
}

export class LaneCmd implements Command {
  name = 'lane [sub-command]';
  description = 'manage lanes for parallel development';
  extendedDescription = `lanes allow isolated development of features without affecting main branch components.
create, switch between, and merge lanes to coordinate parallel work across teams.
without a sub-command, lists all available lanes.`;
  alias = 'l';
  options = [
    ['d', 'details', 'show more details on the state of each component in each lane'],
    ['j', 'json', 'show lanes details in json format'],
    ['r', 'remote <remote-scope-name>', 'show all remote lanes from the specified scope'],
    ['', 'merged', 'list only merged lanes'],
    ['', 'not-merged', "list only lanes that haven't been merged"],
  ] as CommandOptions;
  loader = true;
  group = 'collaborate';
  remoteOp = true;
  skipWorkspace = true;
  helpUrl = 'reference/components/lanes';
  commands: Command[] = [];

  constructor(
    private lanes: LanesMain,
    private workspace: Workspace,
    private scope: ScopeMain
  ) {}

  async report([name]: [string], laneOptions: LaneOptions): Promise<string> {
    return new LaneListCmd(this.lanes, this.workspace, this.scope).report([name], laneOptions);
  }
}

/**
 * @deprecated - only use it to revert the add-readme command changes
 */
export class LaneRemoveReadmeCmd implements Command {
  name = 'remove-readme [laneName]';
  description =
    'DEPRECATED (only use it if you have used add-readme and want to undo it). remove lane readme component';
  options = [] as CommandOptions;
  loader = true;
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

function outputComponents(components: LaneData['components']): string {
  const componentsTitle = `\t${chalk.bold(`components (${components.length})`)}\n`;
  const componentsStr = components.map((c) => `\t  ${c.id.toString()} - ${c.head}`).join('\n');
  return componentsTitle + componentsStr;
}

function outputReadmeComponent(component: LaneData['readmeComponent']): string {
  if (!component) return '';
  return `\n\t${`${chalk.yellow('readme component')}\n\t  ${component.id} - ${
    component.head ||
    `(unsnapped)\n\t("use bit snap ${component.id.fullName}" to snap the readme component on the lane before exporting)`
  }`}\n`;
}
