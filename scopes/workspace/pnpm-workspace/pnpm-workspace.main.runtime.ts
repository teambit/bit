import fs from 'fs-extra';
import path from 'path';
import { BitError } from '@teambit/bit-error';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import { getConfig } from '@teambit/config-store';
import type { EnvsMain } from '@teambit/envs';
import { HostInitializerMain } from '@teambit/host-initializer';
import { EnvsAspect } from '@teambit/envs';
import type { ImporterMain } from '@teambit/importer';
import { ImporterAspect } from '@teambit/importer';
import { InvalidScopeName, isValidScopeName } from '@teambit/legacy-bit-id';
import { CFG_INIT_DEFAULT_SCOPE } from '@teambit/legacy.constants';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { StatusMain } from '@teambit/status';
import { StatusAspect } from '@teambit/status';
import type { TrackerMain } from '@teambit/tracker';
import { TrackerAspect } from '@teambit/tracker';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { WorkspaceRootMain } from '@teambit/workspace-root';
import { WorkspaceRootAspect } from '@teambit/workspace-root';
import { PnpmInitCmd } from './pnpm-init.cmd';
import type { PnpmScript } from './pnpm-script.task';
import { PnpmScriptTask } from './pnpm-script.task';
import { PnpmWorkspaceAspect } from './pnpm-workspace.aspect';
import { PnpmWorkspaceCompiler } from './pnpm-workspace.compiler';
import { PnpmWorkspaceEnv } from './pnpm-workspace.env';
import { ScopeTreeSource, WorkspaceTreeSource } from './pnpm-workspace-tree';
import type { PnpmSyncOptions, PnpmVcsImportPlan, PnpmVcsSyncResult } from './pnpm-workspace-sync';
import {
  applyPnpmImportPlan,
  createPnpmVcsCatalogBindingsOnLoad,
  createPnpmVcsImportPlan,
  findPnpmWithoutWorkspaceCatalogs,
  findPnpmWorkspaceDrift,
  PnpmCmd,
  PNPM_WORKSPACE_CATALOGS_REQUIREMENT,
  PNPM_WORKSPACE_MANIFEST,
  PnpmSyncCmd,
  syncPnpmWorkspace,
} from './pnpm-workspace-sync';

const ENV_SCRIPTS: PnpmScript[] = ['build', 'test', 'lint'];

/**
 * a pnpm workspace managed by bit: every pnpm project is a component and the workspace root is the
 * workspace-root component. the aspect adopts the workspace ("bit pnpm sync"), keeps the pnpm manifest
 * in step when components are imported, and is the env of the projects - a core env, so nothing needs
 * to be installed for bit to build them.
 */
export class PnpmWorkspaceMain {
  constructor(
    private workspace: Workspace | undefined,
    private dependencyResolver: DependencyResolverMain,
    private workspaceRoot: WorkspaceRootMain,
    private logger: Logger
  ) {}

  /**
   * makes a bit workspace out of the pnpm workspace at this path, and runs its first sync. pnpm keeps
   * installing it, so the init leaves package.json alone - an external package manager would get a
   * postinstall script there, which runs bit on every "pnpm install". it writes no AI agent files
   * either: whatever lands at the root is a file of the workspace-root component.
   */
  async init(
    workspacePath: string,
    { defaultScope, env }: PnpmSyncOptions & { defaultScope?: string } = {}
  ): Promise<PnpmVcsSyncResult> {
    if (this.workspace) {
      throw new BitError(
        `a Bit workspace exists at "${this.workspace.path}" already, run "bit pnpm sync" to synchronize its projects`
      );
    }
    if (!(await fs.pathExists(path.join(workspacePath, PNPM_WORKSPACE_MANIFEST)))) {
      throw new BitError(
        `unable to find ${PNPM_WORKSPACE_MANIFEST} in ${workspacePath}, run "bit pnpm init" at the root of the pnpm workspace`
      );
    }
    const defaultScopeToUse = defaultScope || getConfig(CFG_INIT_DEFAULT_SCOPE);
    if (defaultScopeToUse && !isValidScopeName(defaultScopeToUse)) throw new InvalidScopeName(defaultScopeToUse);
    await HostInitializerMain.init(
      workspacePath,
      true, // standalone, the scope is in ".bit"
      true, // no package.json
      false,
      false,
      false,
      false,
      false,
      false,
      { defaultScope: defaultScopeToUse },
      undefined,
      undefined,
      { skipDefaultMcp: true, skipAgentInstructions: true }
    );
    const harmony = await this.workspaceRoot.loadWorkspace(workspacePath);
    const workspace = harmony.get<Workspace>(WorkspaceAspect.id);
    try {
      const result = await syncPnpmWorkspace(workspace, harmony.get<TrackerMain>(TrackerAspect.id), { env });
      await workspace.consumer.onDestroy('pnpm-init');
      return result;
    } catch (err: any) {
      throw new BitError(
        `the Bit workspace was initialized, but its projects failed to synchronize: ${err.message}\nonce fixed, run "bit pnpm sync"`
      );
    }
  }

  /** what an import of these components changes in the pnpm manifest, see applyPnpmImportPlan */
  getImportPlan(components: ConsumerComponent[]): Promise<PnpmVcsImportPlan | undefined> {
    if (!this.workspace) return Promise.resolve(undefined);
    return createPnpmVcsImportPlan(this.workspace, this.dependencyResolver, components);
  }

  /** a pnpm workspace lists its packages in its own manifest, not in workspace.jsonc */
  private async onComponentsWritten(components: ConsumerComponent[]) {
    if (!this.workspace || !this.workspace.isPnpmWorkspace()) return undefined;
    const plan = await this.getImportPlan(components);
    if (!plan) return { handled: true };
    const workspaceBoundPackageNames = await applyPnpmImportPlan(this.workspace.path, plan);
    if (workspaceBoundPackageNames.length) await this.warnForPnpmWithoutWorkspaceCatalogs(this.workspace.path);
    return { handled: true, report: { pnpmVcs: plan } };
  }

  private async warnForPnpmWithoutWorkspaceCatalogs(workspacePath: string) {
    const pnpmVersion = await findPnpmWithoutWorkspaceCatalogs(workspacePath);
    if (!pnpmVersion) return;
    this.logger.consoleWarning(
      `the import bound local packages to "workspace:*" in the pnpm catalog, which pnpm ${pnpmVersion} does not fully support. ${PNPM_WORKSPACE_CATALOGS_REQUIREMENT}`
    );
  }

  static slots = [];
  static dependencies = [
    CLIAspect,
    WorkspaceAspect,
    TrackerAspect,
    DependencyResolverAspect,
    ImporterAspect,
    EnvsAspect,
    WorkspaceRootAspect,
    ScopeAspect,
    LoggerAspect,
    StatusAspect,
  ];
  static runtime = MainRuntime;
  static async provider([
    cli,
    workspace,
    tracker,
    dependencyResolver,
    importer,
    envs,
    workspaceRoot,
    scope,
    loggerMain,
    status,
  ]: [
    CLIMain,
    Workspace | undefined,
    TrackerMain,
    DependencyResolverMain,
    ImporterMain,
    EnvsMain,
    WorkspaceRootMain,
    ScopeMain,
    LoggerMain,
    StatusMain,
  ]) {
    const logger = loggerMain.createLogger(PnpmWorkspaceAspect.id);
    const pnpmWorkspace = new PnpmWorkspaceMain(workspace, dependencyResolver, workspaceRoot, logger);

    envs.registerEnv(
      new PnpmWorkspaceEnv(() => {
        // a workspace build reads the members as the workspace has them, a build in a scope as their remotes do
        const treeSource = workspace ? new WorkspaceTreeSource(workspace, workspaceRoot) : new ScopeTreeSource(scope);
        const buildTasks = ENV_SCRIPTS.map(
          (script) => new PnpmScriptTask(PnpmWorkspaceAspect.id, script, treeSource, workspaceRoot, logger)
        );
        return { compiler: new PnpmWorkspaceCompiler(buildTasks[0], logger), buildTasks };
      })
    );

    if (workspace) {
      workspace.registerOnComponentLoad(createPnpmVcsCatalogBindingsOnLoad(workspace));
      importer.registerOnComponentsWritten((components) => pnpmWorkspace.onComponentsWritten(components));
      status.registerWorkspaceIssues(async () =>
        workspace.isPnpmWorkspace() ? findPnpmWorkspaceDrift(workspace) : []
      );
    }
    const pnpmSyncCmd = new PnpmSyncCmd(workspace, tracker);
    const pnpmCmd = new PnpmCmd(pnpmSyncCmd);
    pnpmCmd.commands = [new PnpmInitCmd(pnpmWorkspace), pnpmSyncCmd];
    cli.register(pnpmCmd);
    return pnpmWorkspace;
  }
}

PnpmWorkspaceAspect.addRuntime(PnpmWorkspaceMain);

export default PnpmWorkspaceMain;
