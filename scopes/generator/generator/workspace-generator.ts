import fs from 'fs-extra';
import type { Harmony } from '@teambit/harmony';
import type { Component } from '@teambit/component';
import execa from 'execa';
import pMapSeries from 'p-map-series';
import type { UiMain } from '@teambit/ui';
import { UIAspect } from '@teambit/ui';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { ForkingMain } from '@teambit/forking';
import { ForkingAspect } from '@teambit/forking';
import type { ImporterMain } from '@teambit/importer';
import { ImporterAspect } from '@teambit/importer';
import type { CompilerMain } from '@teambit/compiler';
import { CompilerAspect } from '@teambit/compiler';
import { getGitExecutablePath, GitNotFound } from '@teambit/git.modules.git-executable';
import { join } from 'path';
import { compact, some } from 'lodash';
import type { ComponentID } from '@teambit/component-id';
import type { GitMain } from '@teambit/git';
import { GitAspect } from '@teambit/git';
import type { InstallMain } from '@teambit/install';
import { InstallAspect } from '@teambit/install';
import { HostInitializerMain } from '@teambit/host-initializer';
import type { WorkspaceConfigFilesMain } from '@teambit/workspace-config-files';
import { WorkspaceConfigFilesAspect } from '@teambit/workspace-config-files';
// import { ComponentGenerator } from './component-generator';
import type { WorkspaceTemplate, WorkspaceContext } from './workspace-template';
import type { NewOptions } from './new.cmd';
import { GeneratorAspect } from './generator.aspect';
import type { BitApi, GeneratorMain } from './generator.main.runtime';

export type GenerateResult = { id: ComponentID; dir: string; files: string[]; envId: string };

export class WorkspaceGenerator {
  private harmony: Harmony;
  private workspace: Workspace;
  private install: InstallMain;
  private importer: ImporterMain;
  private logger?: Logger;
  private forking: ForkingMain;
  private git: GitMain;
  private wsConfigFiles: WorkspaceConfigFilesMain;
  private generator: GeneratorMain;

  constructor(
    private workspaceName: string,
    private workspacePath: string,
    private options: NewOptions & { currentDir?: boolean },
    private template: WorkspaceTemplate,
    private bitApi: BitApi,
    private aspectComponent?: Component
  ) {}

  async generate(): Promise<string> {
    await fs.ensureDir(this.workspacePath);
    try {
      process.chdir(this.workspacePath);
      await this.initGit();
      await HostInitializerMain.init(
        this.workspacePath,
        this.options.skipGit,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        {}
      );
      await this.writeWorkspaceFiles();
      await this.reloadBitInWorkspaceDir();
      // Setting the workspace to be in install context to prevent errors during the workspace generation
      // the workspace will be in install context until the end of the generation install process
      this.workspace.inInstallContext = true;
      await this.setupGitBitmapMergeDriver();
      await this.forkComponentsFromRemote();
      await this.installBeforeCreateComponentsIfNeeded();
      await this.createComponentsFromRemote();
      await this.importComponentsFromRemote();
      await this.workspace.clearCache();
      await this.install.install(undefined, {
        dedupe: true,
        import: false,
        copyPeerToRuntimeOnRoot: true,
        copyPeerToRuntimeOnComponents: false,
        updateExisting: false,
        // This is not needed anymore since PR:
        // keep it here for a while to make sure it doesn't break anything
        // skip pruning here to prevent cases which it caused an error about
        // tsconfig not found because the env location was changed
        // skipPrune: true,
      });

      // compile the components again now that we have the dependencies installed
      await this.compileComponents(true);
      await this.wsConfigFiles.writeConfigFiles({});
    } catch (err: any) {
      this.logger?.error(`failed generating a new workspace, will delete the dir ${this.workspacePath}`, err);
      await fs.remove(this.workspacePath);
      throw err;
    }

    return this.workspacePath;
  }

  private async initGit() {
    if (this.options.skipGit) return;
    const gitExecutablePath = getGitExecutablePath();
    const params = ['init'];
    try {
      await execa(gitExecutablePath, params);
    } catch (err: any) {
      if (err.exitCodeName === 'ENOENT') {
        throw new GitNotFound(gitExecutablePath, err);
      }
      throw err;
    }
  }

  private async setupGitBitmapMergeDriver() {
    if (this.options.skipGit) return;
    await this.git.setGitMergeDriver({ global: false });
  }

  private async buildUI() {
    const uiMain = this.harmony.get<UiMain>(UIAspect.id);
    await uiMain.createRuntime({});
  }

  private getWorkspaceContext(): WorkspaceContext {
    return {
      name: this.workspaceName,
      defaultScope: this.options.defaultScope,
      empty: this.options.empty,
      aspectComponent: this.aspectComponent,
      template: this.template,
      skipGit: this.options.skipGit,
    };
  }

  /**
   * writes the generated template files to the default directory set in the workspace config
   */
  private async writeWorkspaceFiles(): Promise<void> {
    const workspaceContext = this.getWorkspaceContext();
    const templateFiles = await this.template.generateFiles(workspaceContext);
    await Promise.all(
      templateFiles.map(async (templateFile) => {
        await fs.outputFile(join(this.workspacePath, templateFile.relativePath), templateFile.content);
      })
    );
  }

  private async reloadBitInWorkspaceDir() {
    this.harmony = await this.bitApi.loadBit(this.workspacePath);
    this.workspace = this.harmony.get<Workspace>(WorkspaceAspect.id);
    this.install = this.harmony.get<InstallMain>(InstallAspect.id);
    const loggerMain = this.harmony.get<LoggerMain>(LoggerAspect.id);
    this.logger = loggerMain.createLogger(GeneratorAspect.id);
    this.importer = this.harmony.get<ImporterMain>(ImporterAspect.id);
    this.forking = this.harmony.get<ForkingMain>(ForkingAspect.id);
    this.git = this.harmony.get<GitMain>(GitAspect.id);
    this.wsConfigFiles = this.harmony.get<WorkspaceConfigFilesMain>(WorkspaceConfigFilesAspect.id);
    this.generator = this.harmony.get<GeneratorMain>(GeneratorAspect.id);
  }

  private async installBeforeCreateComponentsIfNeeded() {
    if (this.options.empty || !this.template.create) return;
    const configuredEnvs = this.generator.getConfiguredEnvs();
    if (!configuredEnvs.length) return;
    const workspaceContext = this.getWorkspaceContext();
    const componentsToCreate = this.template.create(workspaceContext);
    const aspectsForComponentsToCreate = compact(
      componentsToCreate.map((componentToCreate) => componentToCreate.aspect)
    );
    const needInstall = some(aspectsForComponentsToCreate, (aspect) => {
      return configuredEnvs.includes(aspect);
    });
    if (needInstall) {
      this.logger?.console(
        `installing dependencies in workspace using to load components templates from the following envs: ${configuredEnvs.join(
          ', '
        )}`
      );
      await this.install.install(undefined, {
        dedupe: true,
        import: false,
        copyPeerToRuntimeOnRoot: true,
        copyPeerToRuntimeOnComponents: false,
        updateExisting: false,
      });
    }
  }

  private async createComponentsFromRemote() {
    if (this.options.empty || !this.template.create) return;
    const workspaceContext = this.getWorkspaceContext();
    const componentsToCreate = this.template.create(workspaceContext);
    await pMapSeries(componentsToCreate, async (componentToCreate) => {
      return this.generator.generateComponentTemplate(
        [componentToCreate.componentName],
        componentToCreate.templateName,
        {
          aspect: componentToCreate.aspect,
          env: componentToCreate.env,
          path: componentToCreate.path,
          scope: componentToCreate.scope,
        }
      );
    });
  }

  private async forkComponentsFromRemote() {
    if (this.options.empty) return;
    const workspaceContext = this.getWorkspaceContext();
    const componentsToFork =
      this.template?.importComponents?.(workspaceContext) || this.template?.fork?.(workspaceContext) || [];
    if (!componentsToFork.length) return;
    const componentsToForkRestructured = componentsToFork.map(({ id, targetName, path, env, config, targetScope }) => ({
      sourceId: id,
      targetId: targetName,
      targetScope,
      path,
      env,
      config,
    }));
    await this.forking.forkMultipleFromRemote(componentsToForkRestructured, {
      scope: this.workspace.defaultScope,
      refactor: true,
      install: false,
      compile: false,
    });
  }

  private async importComponentsFromRemote() {
    if (this.options.empty) return;
    const workspaceContext = this.getWorkspaceContext();
    const componentsToImport = this.template?.import?.(workspaceContext) || [];

    if (!componentsToImport.length) return;

    await pMapSeries(componentsToImport, async (componentToImport) => {
      await this.importer.import(
        {
          ids: [componentToImport.id],
          installNpmPackages: false,
          writeConfigFiles: false,
          writeToPath: componentToImport.path,
        },
        []
      );
    });

    await this.workspace.bitMap.write('new');
  }

  private async compileComponents(clearCache = true) {
    if (clearCache) {
      await this.workspace.clearCache();
    }
    const compiler = this.harmony.get<CompilerMain>(CompilerAspect.id);
    await compiler.compileOnWorkspace();
  }
}
