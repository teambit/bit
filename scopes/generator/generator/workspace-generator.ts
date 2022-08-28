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
import { WorkspaceTemplate, WorkspaceContext } from './workspace-template';
import { NewOptions } from './new.cmd';
import { GeneratorAspect } from './generator.aspect';

export type GenerateResult = { id: ComponentID; dir: string; files: string[]; envId: string };

export class WorkspaceGenerator {
  private workspacePath: string;
  private harmony: Harmony;
  private workspace: Workspace;
  private importer: ImporterMain;
  private logger: Logger;
  private forking: ForkingMain;
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
      await init(this.workspacePath, this.options.skipGit, false, false, false, false, false, {});
      await this.writeWorkspaceFiles();
      await this.reloadBitInWorkspaceDir();
      await this.forkComponentsFromRemote();
      await this.importComponentsFromRemote();
      await this.workspace.install(undefined, {
        dedupe: true,
        import: false,
        copyPeerToRuntimeOnRoot: true,
        copyPeerToRuntimeOnComponents: false,
        updateExisting: false,
      });
      // await this.buildUI(); // disabled for now. it takes too long
    } catch (err: any) {
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

  private async buildUI() {
    const uiMain = this.harmony.get<UiMain>(UIAspect.id);
    await uiMain.createRuntime({});
  }

  /**
   * writes the generated template files to the default directory set in the workspace config
   */
  private async writeWorkspaceFiles(): Promise<void> {
    const workspaceContext: WorkspaceContext = {
      name: this.workspaceName,
      defaultScope: this.options.defaultScope,
      empty: this.options.empty,
      aspectComponent: this.aspectComponent,
      template: this.template,
    };
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
    const loggerMain = this.harmony.get<LoggerMain>(LoggerAspect.id);
    this.logger = loggerMain.createLogger(GeneratorAspect.id);
    this.importer = this.harmony.get<ImporterMain>(ImporterAspect.id);
    this.forking = this.harmony.get<ForkingMain>(ForkingAspect.id);
  }

  private async forkComponentsFromRemote() {
    if (this.options.empty) return;
    const componentsToFork = this.template?.importComponents?.() || this.template?.fork?.() || [];
    if (!componentsToFork.length) return;
    const componentsToForkRestructured = componentsToFork.map(({ id, targetName, path }) => ({
      sourceId: id,
      targetId: targetName,
      path,
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
    const componentsToImport = this.template?.import?.() || [];

    if (!componentsToImport.length) return;

    await pMapSeries(componentsToImport, async (componentToImport) => {
      await this.importer.import(
        {
          ids: [componentToImport.id],
          verbose: false,
          objectsOnly: false,
          override: false,
          writeDists: false,
          writeConfig: false,
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
