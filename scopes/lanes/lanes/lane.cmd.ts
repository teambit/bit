// eslint-disable-next-line max-classes-per-file
import chalk from 'chalk';
import { ScopeMain } from '@teambit/scope';
import { Workspace } from '@teambit/workspace';
import { Command, CommandOptions } from '@teambit/cli';
import { BASE_DOCS_DOMAIN } from '@teambit/legacy/dist/constants';
import { LaneData } from '@teambit/legacy/dist/scope/lanes/lanes';
import { getMergeStrategy } from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import { mergeReport } from '@teambit/legacy/dist/cli/commands/public-cmds/merge-cmd';
import { BUILD_ON_CI, isFeatureEnabled } from '@teambit/legacy/dist/api/consumer/lib/feature-toggle';
import { BitError } from '@teambit/bit-error';
import { removePrompt } from '@teambit/legacy/dist/prompts';
import { CreateLaneOptions, LanesMain } from './lanes.main.runtime';

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

export class LaneCreateCmd implements Command {
  name = 'create <name>';
  description = `create and switch to a new lane`;
  alias = '';
  options = [
    [
      '',
      'remote-scope <string>',
      'remote scope where this lane will be exported to (can be changed later with "bit lane track")',
    ],
    [
      '',
      'remote-name <string>',
      'lane name on the remote, default to the local name (can be changed later with "bit lane track")',
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
      : `the default-scope ${chalk.bold(result.remoteScope)}. to change it, please run "bit lane track" command`;
    const title = chalk.green(`successfully added a new lane ${chalk.bold(result.localLane)}`);
    const remoteScopeOutput = `this lane will be exported to ${remoteScopeOrDefaultScope}`;
    return `${title}\n${remoteScopeOutput}`;
  }
}

export class LaneTrackCmd implements Command {
  name = 'track <local-name> <remote-scope> [remote-name]';
  description = `change the remote scope or remote lane of the local lane`;
  alias = '';
  options = [] as CommandOptions;
  loader = true;
  private = true;
  migration = true;

  constructor(private lanes: LanesMain) {}

  async report([localName, remoteScope, remoteName]: [string, string, string]): Promise<string> {
    const { beforeTrackData, afterTrackData } = await this.lanes.trackLane(localName, remoteScope, remoteName);
    const remoteScopeChanges =
      afterTrackData.remoteScope === beforeTrackData?.remoteScope
        ? `the remote-scope has not been changed`
        : `the remote-scope has been changed from ${chalk.bold(
            beforeTrackData?.remoteScope || '<n/a>'
          )} to ${chalk.bold(afterTrackData.remoteScope)}`;
    const remoteNameChanges =
      afterTrackData.remoteLane === beforeTrackData?.remoteLane
        ? `the remote-name has not been changed`
        : `the remote-name has been changed from ${chalk.bold(beforeTrackData?.remoteLane || '<n/a>')} to ${chalk.bold(
            afterTrackData.remoteLane
          )}`;

    return `${remoteScopeChanges}\n${remoteNameChanges}`;
  }
}

export class LaneMergeCmd implements Command {
  name = 'merge <lane>';
  description = `merge a local or a remote lane`;
  alias = '';
  options = [
    ['', 'remote <name>', 'remote scope name'],
    ['', 'ours', 'in case of a conflict, override the used version with the current modification'],
    ['', 'theirs', 'in case of a conflict, override the current modification with the specified version'],
    ['', 'manual', 'in case of a conflict, leave the files with a conflict state to resolve them manually later'],
    ['', 'existing', 'checkout only components in a lane that exist in the workspace'],
    ['', 'no-snap', 'do not auto snap in case the merge completed without conflicts'],
    ['', 'build', 'in case of snap during the merge, run the build-pipeline (similar to bit snap --build)'],
    ['m', 'message <message>', 'override the default message for the auto snap'],
  ] as CommandOptions;
  loader = true;
  private = true;
  migration = true;
  remoteOp = true;

  constructor(private lanes: LanesMain) {}

  async report(
    [name]: [string],
    {
      ours = false,
      theirs = false,
      manual = false,
      remote: remoteName,
      build,
      existing: existingOnWorkspaceOnly = false,
      noSnap = false,
      message: snapMessage = '',
    }: {
      ours: boolean;
      theirs: boolean;
      manual: boolean;
      remote?: string;
      existing?: boolean;
      build?: boolean;
      noSnap: boolean;
      message: string;
    }
  ): Promise<string> {
    build = isFeatureEnabled(BUILD_ON_CI) ? Boolean(build) : true;
    const mergeStrategy = getMergeStrategy(ours, theirs, manual);
    if (noSnap && snapMessage) throw new BitError('unable to use "noSnap" and "message" flags together');

    const results = await this.lanes.mergeLane(name, {
      // @ts-ignore
      remoteName,
      build,
      // @ts-ignore
      mergeStrategy,
      existingOnWorkspaceOnly,
      noSnap,
      snapMessage,
    });
    return mergeReport(results);
  }
}

export class LaneRemoveCmd implements Command {
  name = 'remove <lane...>';
  description = `remove lanes`;
  alias = '';
  options = [
    ['r', 'remote', 'remove a remote lane (in the lane arg, use remote/lane-id syntax)'],
    [
      'f',
      'force',
      'removes the component from the scope, even if used as a dependency. WARNING: components that depend on this component will corrupt',
    ],
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
      const removePromptResult = await removePrompt();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (!yn(removePromptResult.shouldRemove)) {
        throw new BitError('the operation has been canceled');
      }
    }
    const laneResults = await this.lanes.removeLanes(names, { remote, force });
    return chalk.green(`successfully removed the following lane(s): ${chalk.bold(laneResults.join(', '))}`);
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
