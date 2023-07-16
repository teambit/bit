import fs from 'fs-extra';
import { loadBit } from '@teambit/bit';
import { Harmony } from '@teambit/harmony';
import { Component } from '@teambit/component';
import execa from 'execa';
import pMapSeries from 'p-map-series';
import UIAspect, { UiMain } from '@teambit/ui';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { WorkspaceAspect, Workspace } from '@teambit/workspace';
import ForkingAspect, { ForkingMain } from '@teambit/forking';
import { init } from '@teambit/legacy/dist/api/consumer';
import ImporterAspect, { ImporterMain } from '@teambit/importer';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import getGitExecutablePath from '@teambit/legacy/dist/utils/git/git-executable';
import GitNotFound from '@teambit/legacy/dist/utils/git/exceptions/git-not-found';
import { resolve, join } from 'path';
import { ComponentID } from '@teambit/component-id';
import GitAspect, { GitMain } from '@teambit/git';
import { InstallAspect, InstallMain } from '@teambit/install';
import WorkspaceConfigFilesAspect, { WorkspaceConfigFilesMain } from '@teambit/workspace-config-files';

import { WorkspaceTemplate, WorkspaceContext } from './workspace-template';
import { NewOptions } from './new.cmd';
import { GeneratorAspect } from './generator.aspect';

export type GenerateResult = { id: ComponentID; dir: string; files: string[]; envId: string };

export class WorkspaceGenerator {
  private workspacePath: string;
  private harmony: Harmony;
  private workspace: Workspace;
  private install: InstallMain;
  private importer: ImporterMain;
  private logger: Logger;
  private forking: ForkingMain;
  private git: GitMain;
  private wsConfigFiles: WorkspaceConfigFilesMain;

  constructor(
    private workspaceName: string,
    private options: NewOptions,
    private template: WorkspaceTemplate,
    private aspectComponent?: Component
  ) {
    this.workspacePath = resolve(this.workspaceName);
  }

  async generate(): Promise<string> {
    if (fs.existsSync(this.workspacePath)) {
      throw new Error(`unable to create a workspace at "${this.workspaceName}", this path already exist`);
    }
    await fs.ensureDir(this.workspacePath);
    try {
      process.chdir(this.workspacePath);
      await this.initGit();
      await init(this.workspacePath, this.options.skipGit, false, false, false, false, false, false, {});
      await this.writeWorkspaceFiles();
      await this.reloadBitInWorkspaceDir();
      await this.setupGitBitmapMergeDriver();
      await this.forkComponentsFromRemote();
      await this.importComponentsFromRemote();
      await this.install.install(undefined, {
        dedupe: true,
        import: false,
        copyPeerToRuntimeOnRoot: true,
        copyPeerToRuntimeOnComponents: false,
        updateExisting: false,
      });
      await this.wsConfigFiles.writeConfigFiles({});
      // await this.buildUI(); // disabled for now. it takes too long
    } catch (err: any) {
      this.logger.error(`failed generating a new workspace, will delete the dir ${this.workspacePath}`, err);
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
    this.harmony = await loadBit(this.workspacePath);
    this.workspace = this.harmony.get<Workspace>(WorkspaceAspect.id);
    this.install = this.harmony.get<InstallMain>(InstallAspect.id);
    const loggerMain = this.harmony.get<LoggerMain>(LoggerAspect.id);
    this.logger = loggerMain.createLogger(GeneratorAspect.id);
    this.importer = this.harmony.get<ImporterMain>(ImporterAspect.id);
    this.forking = this.harmony.get<ForkingMain>(ForkingAspect.id);
    this.git = this.harmony.get<GitMain>(GitAspect.id);
    this.wsConfigFiles = this.harmony.get<WorkspaceConfigFilesMain>(WorkspaceConfigFilesAspect.id);
  }

  private async forkComponentsFromRemote() {
    if (this.options.empty) return;
    const workspaceContext = this.getWorkspaceContext();
    const componentsToFork =
      this.template?.importComponents?.(workspaceContext) || this.template?.fork?.(workspaceContext) || [];
    if (!componentsToFork.length) return;
    const componentsToForkRestructured = componentsToFork.map(({ id, targetName, path, env, config }) => ({
      sourceId: id,
      targetId: targetName,
      path,
      env,
      config,
    }));
    await this.forking.forkMultipleFromRemote(componentsToForkRestructured, {
      scope: this.workspace.defaultScope,
      refactor: true,
      install: false,
    });
    this.workspace.clearCache();
    await this.compileComponents();
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
          writeToPath: componentToImport.path,
        },
        []
      );
    });

    await this.workspace.bitMap.write();
    this.workspace.clearCache();
    await this.compileComponents();
  }

  private async compileComponents() {
    const compiler = this.harmony.get<CompilerMain>(CompilerAspect.id);
    await compiler.compileOnWorkspace();
  }
}
