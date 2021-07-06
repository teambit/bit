import fs from 'fs-extra';
import { isBinaryFile } from 'isbinaryfile';
import { loadBit } from '@teambit/bit';
import { Harmony } from '@teambit/harmony';
import { Component } from '@teambit/component';
import execa from 'execa';
import pMapSeries from 'p-map-series';
import { WorkspaceAspect, Workspace } from '@teambit/workspace';
import { PkgAspect, PkgMain } from '@teambit/pkg';
import { init } from '@teambit/legacy/dist/api/consumer';
import getGitExecutablePath from '@teambit/legacy/dist/utils/git/git-executable';
import GitNotFound from '@teambit/legacy/dist/utils/git/exceptions/git-not-found';
import path from 'path';
import { EnvsMain } from '@teambit/envs';
import { DependencyResolverMain, DependencyResolverAspect } from '@teambit/dependency-resolver';
import { ComponentID } from '@teambit/component-id';
import { ComponentToImport, WorkspaceFile, WorkspaceTemplate } from './workspace-template';
import { NewOptions } from './new.cmd';

export type GenerateResult = { id: ComponentID; dir: string; files: string[]; envId: string };

export class WorkspaceGenerator {
  private workspacePath: string;
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
    const files = this.template.generateFiles({ name: this.workspaceName });
    await this.writeWorkspaceFiles(files);
    const componentsToImport = this.template?.importComponents?.();
    await this.importAndInstall(componentsToImport);
    await this.initGit();
    return this.workspacePath;
  }

  private async initGit() {
    if (this.options.standalone) return;
    const gitExecutablePath = getGitExecutablePath();
    const params = ['init'];
    try {
      await execa(gitExecutablePath, params);
    } catch (err) {
      if (err.exitCodeName === 'ENOENT') {
        throw new GitNotFound(gitExecutablePath, err);
      }
      throw err;
    }
  }

  /**
   * writes the generated template files to the default directory set in the workspace config
   */
  private async writeWorkspaceFiles(templateFiles: WorkspaceFile[]): Promise<void> {
    await Promise.all(
      templateFiles.map(async (templateFile) => {
        await fs.writeFile(path.join(this.workspacePath, templateFile.relativePath), templateFile.content);
      })
    );
  }

  private async importAndInstall(componentsToImport: ComponentToImport[] = []) {
    process.chdir(this.workspacePath);
    const harmony = await loadBit(this.workspacePath);
    const workspace = harmony.get<Workspace>(WorkspaceAspect.id);
    const dependencyResolver = harmony.get<DependencyResolverMain>(DependencyResolverAspect.id);
    if (componentsToImport.length) {
      const componentsToImportResolved = await Promise.all(
        componentsToImport.map(async (c) => ({
          id: await workspace.resolveComponentId(c.id),
          path: c.path,
        }))
      );
      const componentIds = componentsToImportResolved.map((c) => c.id);
      // @todo: improve performance by changing `getRemoteComponent` api to accept multiple ids
      const components = await Promise.all(componentIds.map((id) => workspace.scope.getRemoteComponent(id)));
      const oldAndNewPackageNames = this.getNewPackageNames(components, harmony, workspace);
      await Promise.all(components.map((comp) => this.replaceOriginalPackageNameWithNew(comp, oldAndNewPackageNames)));
      await pMapSeries(components, async (comp) => {
        const compData = componentsToImportResolved.find((c) => c.id._legacy.isEqualWithoutVersion(comp.id._legacy));
        if (!compData) throw new Error(`workspace-generator, unable to find ${comp.id.toString()} in the given ids`);
        await workspace.write(compData.path, comp);
        await workspace.track({
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
      await dependencyResolver.persistConfig(workspace.path);
      await workspace.writeBitMap();
    }
    await workspace.install();
  }

  private getNewPackageNames(
    components: Component[],
    harmony: Harmony,
    workspace: Workspace
  ): {
    [oldPackageName: string]: string;
  } {
    const pkg = harmony.get<PkgMain>(PkgAspect.id);
    const packageToReplace = {};
    const scopeToReplace = workspace.defaultScope.replace('.', '/');
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
