import fs from 'fs-extra';
import { isBinaryFile } from 'isbinaryfile';
import { loadBit } from '@teambit/bit';
import { Harmony } from '@teambit/harmony';
import { Component } from '@teambit/component';
import pMapSeries from 'p-map-series';
import { WorkspaceAspect, Workspace } from '@teambit/workspace';
import { PkgAspect, PkgMain } from '@teambit/pkg';
import { init } from '@teambit/legacy/dist/api/consumer';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import path from 'path';
import { EnvsMain } from '@teambit/envs';
import { DependencyResolverMain, DependencyResolverAspect } from '@teambit/dependency-resolver';
import { ComponentID } from '@teambit/component-id';
import { WorkspaceTemplate } from './workspace-template';
import { NewOptions } from './new.cmd';

export type GenerateResult = { id: ComponentID; dir: string; files: string[]; envId: string };

export class WorkspaceGenerator {
  private workspacePath: string;
  private harmony: Harmony;
  private workspace: Workspace;
  constructor(
    private workspaceName: string,
    private options: NewOptions,
    private template: WorkspaceTemplate,
    private envs: EnvsMain
  ) {
    this.workspacePath = path.resolve(this.workspaceName);
  }

  async generate(): Promise<string> {
    if (fs.existsSync(this.workspacePath)) {
      throw new Error(`unable to create a workspace at "${this.workspaceName}", this path already exist`);
    }
    await fs.ensureDir(this.workspacePath);
    await init(this.workspacePath, this.options.standalone, false, false, false, false, {});
    await this.writeWorkspaceFiles();
    await this.reloadBitInWorkspaceDir();
    await this.addComponentsFromRemote();
    await this.workspace.install();

    return this.workspacePath;
  }

  /**
   * writes the generated template files to the default directory set in the workspace config
   */
  private async writeWorkspaceFiles(): Promise<void> {
    const templateFiles = this.template.generateFiles({ name: this.workspaceName });
    await Promise.all(
      templateFiles.map(async (templateFile) => {
        await fs.writeFile(path.join(this.workspacePath, templateFile.relativePath), templateFile.content);
      })
    );
  }

  private async reloadBitInWorkspaceDir() {
    process.chdir(this.workspacePath);
    this.harmony = await loadBit(this.workspacePath);
    this.workspace = this.harmony.get<Workspace>(WorkspaceAspect.id);
  }

  private async addComponentsFromRemote() {
    const componentsToImport = this.template?.importComponents?.();
    if (!componentsToImport || !componentsToImport.length) return;
    const dependencyResolver = this.harmony.get<DependencyResolverMain>(DependencyResolverAspect.id);

    const componentsToImportResolved = await Promise.all(
      componentsToImport.map(async (c) => ({
        id: await this.workspace.resolveComponentId(c.id),
        path: c.path,
      }))
    );
    const componentIds = componentsToImportResolved.map((c) => c.id);
    // @todo: improve performance by changing `getRemoteComponent` api to accept multiple ids
    const components = await Promise.all(componentIds.map((id) => this.workspace.scope.getRemoteComponent(id)));
    const oldAndNewPackageNames = this.getNewPackageNames(components);
    await Promise.all(components.map((comp) => this.replaceOriginalPackageNameWithNew(comp, oldAndNewPackageNames)));
    await pMapSeries(components, async (comp) => {
      const compData = componentsToImportResolved.find((c) => c.id._legacy.isEqualWithoutVersion(comp.id._legacy));
      if (!compData) throw new Error(`workspace-generator, unable to find ${comp.id.toString()} in the given ids`);
      await this.workspace.write(compData.path, comp);
      await this.workspace.track({
        rootDir: compData.path,
        componentName: compData.id.fullName,
        mainFile: comp.state._consumer.mainFile,
      });
      const deps = await dependencyResolver.getDependencies(comp);
      const currentPackages = Object.keys(oldAndNewPackageNames);
      const workspacePolicyEntries = deps
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
    await this.compileComponents();
    await dependencyResolver.persistConfig(this.workspace.path);
    await this.workspace.writeBitMap();
  }

  private async compileComponents() {
    const compiler = this.harmony.get<CompilerMain>(CompilerAspect.id);
    await compiler.compileOnWorkspace();
  }

  private getNewPackageNames(components: Component[]): { [oldPackageName: string]: string } {
    const pkg = this.harmony.get<PkgMain>(PkgAspect.id);
    const packageToReplace = {};
    const scopeToReplace = this.workspace.defaultScope.replace('.', '/');
    components.forEach((comp) => {
      const currentPackageName = pkg.getPackageName(comp);
      const newPackageName = currentPackageName.replace(comp.id.scope.replace('.', '/'), scopeToReplace);
      packageToReplace[currentPackageName] = newPackageName;
    });
    return packageToReplace;
  }

  private async replaceOriginalPackageNameWithNew(comp: Component, packageToReplace: Record<string, string>) {
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
        if (strContent !== newContent) {
          file.contents = Buffer.from(newContent);
        }
      })
    );
  }
}
