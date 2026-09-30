import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import type { EnvsMain } from '@teambit/envs';
import { EnvsAspect } from '@teambit/envs';
import type { ImporterMain } from '@teambit/importer';
import { ImporterAspect } from '@teambit/importer';
import type { InstallMain } from '@teambit/install';
import { InstallAspect } from '@teambit/install';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { TrackerMain } from '@teambit/tracker';
import { TrackerAspect } from '@teambit/tracker';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { WorkspaceRootMain } from '@teambit/workspace-root';
import { WorkspaceRootAspect } from '@teambit/workspace-root';
import type { PnpmError } from './pnpm-utils';
import { runPnpm } from './pnpm-utils';
import type { PnpmScript } from './pnpm-script.task';
import { PnpmScriptTask } from './pnpm-script.task';
import { PnpmWorkspaceAspect } from './pnpm-workspace.aspect';
import { PnpmWorkspaceCompiler } from './pnpm-workspace.compiler';
import { PnpmWorkspaceEnv } from './pnpm-workspace.env';
import { ScopeTreeSource, WorkspaceTreeSource } from './pnpm-workspace-tree';
import type { PnpmVcsImportPlan } from './pnpm-workspace-sync';
import {
  applyPnpmImportPlan,
  createPnpmVcsCatalogBindingsOnLoad,
  createPnpmVcsImportPlan,
  findPnpmWithoutWorkspaceCatalogs,
  isPnpmWorkspace,
  PnpmCmd,
  PNPM_WORKSPACE_CATALOGS_REQUIREMENT,
  PnpmSyncCmd,
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
    private logger: Logger
  ) {}

  /** what an import of these components changes in the pnpm manifest, see applyPnpmImportPlan */
  getImportPlan(components: ConsumerComponent[]): Promise<PnpmVcsImportPlan | undefined> {
    if (!this.workspace) return Promise.resolve(undefined);
    return createPnpmVcsImportPlan(this.workspace, this.dependencyResolver, components);
  }

  /** a pnpm workspace lists its packages in its own manifest, not in workspace.jsonc */
  private async onComponentsWritten(components: ConsumerComponent[]) {
    if (!this.workspace || !isPnpmWorkspace(this.workspace)) return undefined;
    const plan = await this.getImportPlan(components);
    if (!plan) return { handled: true };
    const workspaceBoundPackageNames = await applyPnpmImportPlan(this.workspace.path, plan);
    if (workspaceBoundPackageNames.length) await this.warnForPnpmWithoutWorkspaceCatalogs(this.workspace.path);
    return { handled: true, report: { pnpmVcs: plan } };
  }

  /**
   * the user's pnpm installs the workspace, as it does without bit: the packages' own package.json files
   * and the lockfile say what to install, and pnpm lays out node_modules its own way.
   */
  private async installWithPnpm(workspacePath: string): Promise<void> {
    try {
      const output = await runPnpm(['install'], workspacePath);
      if (output.trim()) this.logger.console(output.trim());
    } catch (err: any) {
      const output = (err as PnpmError).output?.trim();
      if (output) this.logger.console(output);
      throw err;
    }
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
    InstallAspect,
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
    install,
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
    InstallMain,
  ]) {
    const logger = loggerMain.createLogger(PnpmWorkspaceAspect.id);
    const pnpmWorkspace = new PnpmWorkspaceMain(workspace, dependencyResolver, logger);

    // a workspace build reads the members as the workspace has them, a build in a scope as their remotes do
    const treeSource = workspace ? new WorkspaceTreeSource(workspace, workspaceRoot) : new ScopeTreeSource(scope);
    const tasks = ENV_SCRIPTS.map(
      (script) => new PnpmScriptTask(PnpmWorkspaceAspect.id, script, treeSource, workspaceRoot, logger)
    );
    envs.registerEnv(new PnpmWorkspaceEnv(new PnpmWorkspaceCompiler(tasks[0], logger), tasks));

    if (workspace) {
      workspace.registerOnComponentLoad(createPnpmVcsCatalogBindingsOnLoad(workspace));
      importer.registerOnComponentsWritten((components) => pnpmWorkspace.onComponentsWritten(components));
      install.registerExternalInstaller({
        name: 'pnpm',
        installsWorkspace: () => isPnpmWorkspace(workspace),
        install: () => pnpmWorkspace.installWithPnpm(workspace.path),
      });
    }
    const pnpmSyncCmd = new PnpmSyncCmd(workspace, tracker);
    const pnpmCmd = new PnpmCmd(pnpmSyncCmd);
    pnpmCmd.commands = [pnpmSyncCmd];
    cli.register(pnpmCmd);
    return pnpmWorkspace;
  }
}

PnpmWorkspaceAspect.addRuntime(PnpmWorkspaceMain);

export default PnpmWorkspaceMain;
