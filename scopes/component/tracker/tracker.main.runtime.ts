import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime, formatItem } from '@teambit/cli';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import { concurrentFetchLimit } from '@teambit/harmony.modules.concurrency';
import path from 'path';
import type { ComponentID } from '@teambit/component-id';
import { EnvsAspect } from '@teambit/envs';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect, OutsideWorkspaceError } from '@teambit/workspace';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import { logger as legacyLogger } from '@teambit/legacy.logger';
import type { PathOsBasedRelative, PathOsBasedAbsolute, PathLinuxRelative } from '@teambit/legacy.utils';
import { pathNormalizeToLinux } from '@teambit/legacy.utils';
import { AddCmd } from './add-cmd';
import type { AddActionResults, AddContext, AddProps, Warnings } from './add-components';
import AddComponents, { addMultipleFromResolvedTrackData } from './add-components';
import { TrackerAspect } from './tracker.aspect';

export type TrackResult = { files: string[]; warnings: Warnings; componentId: ComponentID };

/**
 * upper bound for the best-effort remote collision check. it's only an early warning, so it's
 * better to skip it than to make the user wait on an unresponsive remote.
 */
const REMOTE_COLLISION_CHECK_TIMEOUT_MS = 5000;

/**
 * this is for "bit add", where some data, such as "componentName" are not necessarily known
 */
export type TrackData = {
  rootDir: PathOsBasedRelative | PathOsBasedAbsolute; // path relative to the workspace or absolute path
  componentName?: string; // if empty, it'll be generated from the path
  mainFile?: string; // if empty, attempts will be made to guess the best candidate
  defaultScope?: string; // can be entered as part of "bit create" command, helpful for out-of-sync logic
  config?: { [aspectName: string]: any }; // config specific to this component, which overrides variants of workspace.jsonc
};

/**
 * this is for commands where we know all the data to enter into .bitmap, such as defaultScope, componentName and files.
 */
export type ResolvedTrackData = {
  rootDir: PathLinuxRelative; // path relative to the workspace
  componentName: string;
  mainFile: string;
  files: string[]; // component files relative to the component rootDir
  defaultScope: string;
  config?: { [aspectName: string]: any }; // config specific to this component, which overrides variants of workspace.jsonc
};

export class TrackerMain {
  constructor(
    private workspace: Workspace,
    private logger: Logger
  ) {}

  /**
   * add a new component to the .bitmap file.
   * this method only adds the records in memory but doesn't persist to the filesystem.
   * to write the .bitmap file once completed, run "await this.bitMap.write();"
   */
  async track(trackData: TrackData): Promise<TrackResult> {
    const defaultScope = trackData.defaultScope ? await this.addOwnerToScopeName(trackData.defaultScope) : undefined;
    const compPath = pathNormalizeToLinux(
      path.isAbsolute(trackData.rootDir) ? trackData.rootDir : path.join(this.workspace.path, trackData.rootDir)
    );
    const addComponent = new AddComponents(
      { workspace: this.workspace },
      {
        componentPaths: [compPath],
        id: trackData.componentName,
        main: trackData.mainFile,
        override: false,
        defaultScope,
        config: trackData.config,
      }
    );
    const result = await addComponent.add();
    const addedComponent = result.addedComponents[0];
    const files = addedComponent?.files.map((f) => f.relativePath) || [];
    return { files, warnings: result.warnings, componentId: result.addedComponents[0].id };
  }

  async trackMany(manyTrackData: ResolvedTrackData[]): Promise<ComponentID[]> {
    return addMultipleFromResolvedTrackData(this.workspace, manyTrackData);
  }

  async addForCLI(addProps: AddProps): Promise<AddActionResults> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const addContext: AddContext = { workspace: this.workspace };
    addProps.shouldHandleOutOfSync = true;
    if (addProps.env) {
      const config = {};
      await this.addEnvToConfig(addProps.env, config);
      addProps.config = config;
    }
    const addComponents = new AddComponents(addContext, addProps);
    const addResults = await addComponents.add();
    await this.workspace.consumer.onDestroy('add');

    await this.warnAboutRemoteIdCollisions(addResults.addedComponents.map((added) => added.id));

    return addResults;
  }

  /**
   * best-effort early warning: if any of the just-added/created components share an id with a
   * component that already exists on the remote scope, let the user know now — before they invest
   * work and hit a wall at export. fully non-blocking: the remote check swallows offline / no-access
   * / scope-not-found errors, is bounded by a timeout so a stalled remote can't delay the command,
   * and the whole method is wrapped so it can never fail an add/create.
   */
  async warnAboutRemoteIdCollisions(ids: ComponentID[]): Promise<void> {
    // `shouldWriteToConsole` (not `isJsonFormat`) is the signal that reflects the CLI "--json" flag.
    if (!ids.length || !legacyLogger.shouldWriteToConsole) return;
    // only brand-new components can "collide" with the remote. skip already-exported ones (e.g. a
    // re-tracked imported/exported component), where remote existence is expected, not a conflict.
    const newIds = ids.filter((id) => !this.workspace.isExported(id));
    if (!newIds.length) return;
    try {
      const idsOnRemote = await this.getIdsExistingOnRemote(newIds);
      if (!idsOnRemote.length) return;
      const list = idsOnRemote.map((id) => formatItem(id.toStringWithoutVersion())).join('\n');
      const example = idsOnRemote[0];
      this.logger
        .consoleWarning(`the following newly added component(s) already exist on the remote scope with the same id:
${list}
if you meant to work on the existing component, remove your local one and run "bit import ${example.toStringWithoutVersion()}".
if this is a new, unrelated component, rename yours to avoid the clash, e.g. "bit rename ${example.fullName} <new-name>" (or "bit rename ${example.fullName} ${example.fullName} --scope <other-scope>" to change only the scope).`);
    } catch (err) {
      // never let an early-warning break "bit add" / "bit create", but keep it diagnosable.
      this.logger.debug(`warnAboutRemoteIdCollisions: skipping the remote-collision check, got an error: ${err}`);
    }
  }

  /**
   * the remote calls have no request-level timeout of their own (and http retries for up to a
   * minute), so a stalled remote would otherwise keep "bit add"/"bit create" waiting. race the
   * checks against a timeout and simply skip the warning if the remote is too slow to answer.
   */
  private async getIdsExistingOnRemote(ids: ComponentID[]): Promise<ComponentID[]> {
    const checkAll = (async () => {
      // resolve the remotes once (it reads the global-remotes file from disk) and reuse for all ids.
      const remotes = await this.workspace.scope.getRemoteScopes();
      const results = await pMapPool(
        ids,
        async (id) => ((await this.workspace.scope.isComponentExistsOnRemote(id, remotes)) ? id : undefined),
        // `remote.show()` is network I/O, so bound it by the fetch limit (not the component limit).
        { concurrency: concurrentFetchLimit() }
      );
      return results.filter((id): id is ComponentID => Boolean(id));
    })();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const skipIfTooSlow = new Promise<ComponentID[]>((resolve) => {
      timer = setTimeout(() => resolve([]), REMOTE_COLLISION_CHECK_TIMEOUT_MS);
      timer.unref(); // this timer should never keep the process alive on its own
    });

    try {
      return await Promise.race([checkAll, skipIfTooSlow]);
    } finally {
      // clear the timer when the check wins the race, so no callback stays scheduled.
      if (timer) clearTimeout(timer);
    }
  }

  async addEnvToConfig(env: string, config: { [aspectName: string]: any }) {
    const userEnvId = await this.workspace.resolveComponentId(env);
    let userEnvIdWithPotentialVersion: string;
    try {
      userEnvIdWithPotentialVersion = await this.workspace.resolveEnvIdWithPotentialVersionForConfig(userEnvId);
    } catch {
      // the env needs to be without version
      userEnvIdWithPotentialVersion = userEnvId.toStringWithoutVersion();
    }
    config[userEnvIdWithPotentialVersion] = {};
    config[EnvsAspect.id] = config[EnvsAspect.id] || {};
    config[EnvsAspect.id].env = userEnvId.toStringWithoutVersion();
  }

  /**
   * scopes in bit.dev are "owner.collection".
   * we might have the scope-name only without the owner and we need to retrieve it from the defaultScope in the
   * workspace.jsonc file.
   *
   * @param scopeName scopeName that might not have the owner part.
   * @returns full scope name
   */
  private async addOwnerToScopeName(scopeName: string): Promise<string> {
    if (scopeName.includes('.')) return scopeName; // it has owner.
    const isSelfHosted = !(await this.isHostedByBit(scopeName));
    if (isSelfHosted) return scopeName;
    const wsDefaultScope = this.workspace.defaultScope;
    if (!wsDefaultScope.includes('.')) {
      this.logger.warn(`the entered scope ${scopeName} has no owner nor the defaultScope in workspace.jsonc`);
      // it's possible that the user entered a non-exist scope just to test the command and will change it later.
      return scopeName;
    }
    const [owner] = wsDefaultScope.split('.');
    return `${owner}.${scopeName}`;
  }

  /**
   * whether a scope is hosted by Bit cloud.
   * otherwise, it is self-hosted
   */
  private async isHostedByBit(scopeName: string): Promise<boolean> {
    const remotes = await this.workspace.scope.getRemoteScopes();
    return remotes.isHub(scopeName);
  }

  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect, LoggerAspect];
  static runtime = MainRuntime;
  static async provider([cli, workspace, loggerMain]: [CLIMain, Workspace, LoggerMain]) {
    const logger = loggerMain.createLogger(TrackerAspect.id);
    const trackerMain = new TrackerMain(workspace, logger);
    cli.register(new AddCmd(trackerMain));
    return trackerMain;
  }
}

TrackerAspect.addRuntime(TrackerMain);

export default TrackerMain;
