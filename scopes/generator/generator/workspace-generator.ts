import fs from 'fs-extra';
import { isBinaryFile } from 'isbinaryfile';
import { loadBit } from '@teambit/bit';
import { Harmony } from '@teambit/harmony';
import { Component } from '@teambit/component';
import execa from 'execa';
import { BitId } from '@teambit/legacy-bit-id';
import pMapSeries from 'p-map-series';
import UIAspect, { UiMain } from '@teambit/ui';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { WorkspaceAspect, Workspace } from '@teambit/workspace';
import { PkgAspect, PkgMain } from '@teambit/pkg';
import { init } from '@teambit/legacy/dist/api/consumer';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import getGitExecutablePath from '@teambit/legacy/dist/utils/git/git-executable';
import GitNotFound from '@teambit/legacy/dist/utils/git/exceptions/git-not-found';
import path from 'path';
import { DependencyResolverMain, DependencyResolverAspect } from '@teambit/dependency-resolver';
import { ComponentID } from '@teambit/component-id';
import { WorkspaceTemplate } from './workspace-template';
import { NewOptions } from './new.cmd';
import { GeneratorAspect } from './generator.aspect';

export type GenerateResult = { id: ComponentID; dir: string; files: string[]; envId: string };

type CompToImportResolved = {
  id: ComponentID;
  path: string;
  targetName?: string;
};

export class WorkspaceGenerator {
  private workspacePath: string;
  private harmony: Harmony;
  private workspace: Workspace;
  private logger: Logger;
  constructor(
    private workspaceName: string,
    private options: NewOptions,
    private template: WorkspaceTemplate,
    private aspectComponent?: Component
  ) {
    this.workspacePath = path.resolve(this.workspaceName);
  }

  async generate(): Promise<string> {
    if (fs.existsSync(this.workspacePath)) {
      throw new Error(`unable to create a workspace at "${this.workspaceName}", this path already exist`);
    }
    await fs.ensureDir(this.workspacePath);
    try {
      process.chdir(this.workspacePath);
      await this.initGit();
      await init(this.workspacePath, this.options.skipGit, false, false, false, false, {});
      await this.writeWorkspaceFiles();
      await this.reloadBitInWorkspaceDir();
      await this.addComponentsFromRemote();
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
    const workspaceContext = {
      name: this.workspaceName,
      defaultScope: this.options.defaultScope,
      empty: this.options.empty,
      aspectComponent: this.aspectComponent,
    };
    const templateFiles = await this.template.generateFiles(workspaceContext);
    await Promise.all(
      templateFiles.map(async (templateFile) => {
        await fs.outputFile(path.join(this.workspacePath, templateFile.relativePath), templateFile.content);
      })
    );
  }

  private async reloadBitInWorkspaceDir() {
    this.harmony = await loadBit(this.workspacePath);
    this.workspace = this.harmony.get<Workspace>(WorkspaceAspect.id);
    const loggerMain = this.harmony.get<LoggerMain>(LoggerAspect.id);
    this.logger = loggerMain.createLogger(GeneratorAspect.id);
  }

  private async addComponentsFromRemote() {
    if (this.options.empty) return;
    const componentsToImport = this.template?.importComponents?.();
    if (!componentsToImport || !componentsToImport.length) return;
    const dependencyResolver = this.harmony.get<DependencyResolverMain>(DependencyResolverAspect.id);

    const componentsToImportResolved = await Promise.all(
      componentsToImport.map(async (c) => ({
        id: ComponentID.fromLegacy(BitId.parse(c.id, true)),
        path: c.path,
        targetName: c.targetName,
      }))
    );
    const componentIds = componentsToImportResolved.map((c) => c.id);
    // @todo: improve performance by changing `getRemoteComponent` api to accept multiple ids
    const components = await Promise.all(componentIds.map((id) => this.workspace.scope.getRemoteComponent(id)));
    const oldAndNewPackageNames = this.getNewPackageNames(components, componentsToImportResolved);
    const oldAndNewComponentIds = this.getNewComponentIds(components, componentsToImportResolved);
    await Promise.all(
      components.map((comp) =>
        this.replaceOriginalPackageNameWithNew(comp, oldAndNewPackageNames, oldAndNewComponentIds)
      )
    );
    await pMapSeries(components, async (comp) => {
      const compData = componentsToImportResolved.find((c) => c.id._legacy.isEqualWithoutVersion(comp.id._legacy));
      if (!compData) throw new Error(`workspace-generator, unable to find ${comp.id.toString()} in the given ids`);
      await this.workspace.write(compData.path, comp);
      await this.workspace.track({
        rootDir: compData.path,
        componentName: compData.targetName || compData.id.fullName,
        mainFile: comp.state._consumer.mainFile,
      });
      const deps = await dependencyResolver.getDependencies(comp);

      const currentPackages = Object.keys(oldAndNewPackageNames);
      // only bring auto-resolved dependencies, others should be set in the workspace.jsonc template
      const workspacePolicyEntries = deps
        .filter((dep) => dep.source === 'auto')
        .map((dep) => ({
          dependencyId: dep.getPackageName?.() || dep.id,
          lifecycleType: dep.lifecycle === 'dev' ? 'runtime' : dep.lifecycle,
          value: {
            version: dep.version,
          },
        }))
        .filter((entry) => !currentPackages.includes(entry.dependencyId)); // remove components that are now imported
      dependencyResolver.addToRootPolicy(workspacePolicyEntries, { updateExisting: true });
    });
    await this.workspace.writeBitMap();
    await dependencyResolver.persistConfig(this.workspace.path);
    this.workspace.clearCache();
    await this.compileComponents();
  }

  private async compileComponents() {
    const compiler = this.harmony.get<CompilerMain>(CompilerAspect.id);
    await compiler.compileOnWorkspace();
  }

  private getNewPackageNames(
    components: Component[],
    compsData: CompToImportResolved[]
  ): { [oldPackageName: string]: string } {
    const pkg = this.harmony.get<PkgMain>(PkgAspect.id);
    const packageToReplace = {};
    const scopeToReplace = this.workspace.defaultScope.replace('.', '/');
    components.forEach((comp) => {
      const newId = this.resolveNewCompId(comp, compsData);
      const currentPackageName = pkg.getPackageName(comp);
      const newName = newId.fullName.replace(/\//g, '.');
      const newPackageName = `@${scopeToReplace}.${newName}`;
      packageToReplace[currentPackageName] = newPackageName;
    });
    return packageToReplace;
  }

  private getNewComponentIds(
    components: Component[],
    compsData: CompToImportResolved[]
  ): { [oldComponentId: string]: string } {
    const componentToReplace = {};
    components.forEach((comp) => {
      const newId = this.resolveNewCompId(comp, compsData);
      componentToReplace[comp.id.toStringWithoutVersion()] = newId.toStringWithoutVersion();
    });
    return componentToReplace;
  }

  private resolveNewCompId(comp: Component, compsData: CompToImportResolved[]): ComponentID {
    const scopeToReplace = this.workspace.defaultScope;
    const compData = compsData.find((c) => c.id._legacy.isEqualWithoutScopeAndVersion(comp.id._legacy));
    if (!compData) {
      throw new Error(`workspace-generator: unable to find data for "${comp.id._legacy.toString()}"`);
    }
    return compData.targetName
      ? ComponentID.fromLegacy(BitId.parse(compData.targetName, false).changeScope(scopeToReplace))
      : comp.id.changeScope(scopeToReplace);
  }

  private async replaceOriginalPackageNameWithNew(
    comp: Component,
    packageToReplace: Record<string, string>,
    oldAndNewComponentIds: Record<string, string>
  ) {
    await Promise.all(
      comp.filesystem.files.map(async (file) => {
        const isBinary = await isBinaryFile(file.contents);
        if (isBinary) return;
        const strContent = file.contents.toString();
        let newContent = strContent;
        Object.keys(packageToReplace).forEach((currentPackage) => {
          if (strContent.includes(currentPackage)) {
            const currentPkgRegex = new RegExp(currentPackage, 'g');
            newContent = newContent.replace(currentPkgRegex, packageToReplace[currentPackage]);
          }
        });
        Object.keys(oldAndNewComponentIds).forEach((currentId) => {
          if (strContent.includes(currentId)) {
            const currentIdRegex = new RegExp(currentId, 'g');
            newContent = newContent.replace(currentIdRegex, oldAndNewComponentIds[currentId]);
          }
        });
        if (strContent !== newContent) {
          file.contents = Buffer.from(newContent);
        }
      })
    );
  }
}
