import {
  DependenciesObjectDefinition,
  DependencyResolverMain,
  PackageManager,
  PackageManagerInstallOptions,
  ComponentsManifestsMap,
  CreateFromComponentsOptions,
  PackageManagerResolveRemoteVersionOptions,
  ResolvedPackageVersion,
} from '@teambit/dependency-resolver';
import { ComponentMap, Component } from '@teambit/component';
import { unlinkSync, statSync } from 'fs-extra';
import { join, resolve } from 'path';
import {
  Workspace,
  Project,
  Configuration,
  structUtils,
  IdentHash,
  Descriptor,
  Cache,
  StreamReport,
} from '@yarnpkg/core';
import { getPluginConfiguration } from '@yarnpkg/cli';
import { npath } from '@yarnpkg/fslib';
import { PkgMain } from '@teambit/pkg';

export class YarnPackageManager implements PackageManager {
  constructor(private depResolver: DependencyResolverMain, private pkg: PkgMain) {}

  async install(
    rootDir: string,
    rootDepsObject: DependenciesObjectDefinition,
    componentDirectoryMap: ComponentMap<string>,
    installOptions: PackageManagerInstallOptions = {}
  ): Promise<void> {
    const options: CreateFromComponentsOptions = {
      filterComponentsFromManifests: true,
      createManifestForComponentsWithoutDependencies: true,
      dedupe: false,
    };
    const components = componentDirectoryMap.components;
    const workspaceManifest = await this.depResolver.getWorkspaceManifest(
      undefined,
      undefined,
      rootDepsObject,
      rootDir,
      components,
      options
    );

    const rootDirPath = npath.toPortablePath(rootDir);
    const pluginConfig = getPluginConfiguration();
    const config = await Configuration.find(rootDirPath, pluginConfig);
    // TODO: node-modules is hardcoded now until adding support for pnp.
    config.use('<bit>', { nodeLinker: 'node-modules' }, rootDirPath, {});
    const project = new Project(rootDirPath, { configuration: config });
    // @ts-ignore
    project.setupResolutions();
    const rootWs = await this.createWorkspace(
      rootDir,
      project,
      workspaceManifest.toJson({
        includeDir: true,
        copyPeerToRuntime: installOptions.copyPeerToRuntimeOnRoot,
      })
    );

    // const manifests = Array.from(workspaceManifest.componentsManifestsMap.entries());
    const manifests = this.computeComponents(
      workspaceManifest.componentsManifestsMap,
      componentDirectoryMap,
      installOptions.copyPeerToRuntimeOnComponents
    );

    const workspacesP = Object.keys(manifests).map(async (path) => {
      const manifest = manifests[path];
      return this.createWorkspace(path, project, manifest);
    });

    const workspaces = await Promise.all(workspacesP);

    this.setupWorkspaces(project, workspaces.concat(rootWs));

    const cache = await Cache.find(config);
    const installReport = await StreamReport.start(
      {
        stdout: process.stdout,
        configuration: config,
      },
      async (report) => {
        await project.install({
          cache,
          report,
        });
      }
    );

    this.removeSymlinks(rootDir, components);
  }

  private removeSymlinks(rootDir: string, components: Component[]) {
    return components.map((component) => {
      const packageName = this.pkg.getPackageName(component);
      const path = resolve(join(rootDir, 'node_modules', packageName));
      const stats = statSync(path);
      if (stats.isSymbolicLink()) {
        unlinkSync(path);
      }
    });
  }

  private async createWorkspace(rootDir: string, project: Project, manifest: any) {
    const wsPath = npath.toPortablePath(rootDir);
    const name = manifest.name || 'workspace';

    const ws = new Workspace(wsPath, { project });
    await ws.setup();
    const identity = structUtils.parseIdent(name);
    ws.manifest.name = identity;
    ws.manifest.version = manifest.version;
    ws.manifest.dependencies = this.computeDeps(manifest.dependencies);
    ws.manifest.devDependencies = this.computeDeps(manifest.devDependencies);
    ws.manifest.peerDependencies = this.computeDeps(manifest.peerDependencies);

    return ws;
  }

  private setupWorkspaces(project: Project, workspaces: Workspace[]) {
    project.workspaces = [];
    project.workspacesByCwd = new Map();
    project.workspacesByIdent = new Map();

    workspaces.forEach((workspace) => {
      const dup = project.workspacesByIdent.get(workspace.locator.identHash);
      if (typeof dup !== `undefined`) {
        throw new Error(`Duplicate workspace name: ${workspace.cwd} conflicts with ${dup.cwd}`);
      }

      project.workspaces.push(workspace);
      project.workspacesByCwd.set(workspace.cwd, workspace);
      project.workspacesByIdent.set(workspace.locator.identHash, workspace);
    });
  }

  // TODO: implement this to automate configuration.
  private computeConfiguration() {}

  private computeComponents(
    componentManifests: ComponentsManifestsMap,
    componentsDirMap: ComponentMap<string>,
    copyPeer = false
  ): { [key: string]: any } {
    return componentsDirMap.toArray().reduce((acc, [component, dir]) => {
      const packageName = this.pkg.getPackageName(component);
      if (componentManifests.has(packageName)) {
        acc[dir] = componentManifests.get(packageName)?.toJson({ copyPeerToRuntime: copyPeer });
      }

      return acc;
    }, {});
  }

  private computeDeps(rawDeps?: { [key: string]: string }): Map<IdentHash, Descriptor> {
    const map = new Map<IdentHash, Descriptor>();
    if (!rawDeps) return map;

    Object.keys(rawDeps).forEach((packageName) => {
      const ident = structUtils.parseIdent(packageName);
      map.set(ident.identHash, structUtils.makeDescriptor(ident, rawDeps[packageName]));
    });

    return map;
  }

  async resolveRemoteVersion(
    packageName: string,
    options: PackageManagerResolveRemoteVersionOptions
  ): Promise<ResolvedPackageVersion> {}
}
