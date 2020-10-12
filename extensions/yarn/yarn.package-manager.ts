import execa from 'execa';
import * as semver from 'semver';
import parsePackageName from 'parse-package-name';
import {
  DependenciesObjectDefinition,
  DependencyResolverMain,
  PackageManager,
  PackageManagerInstallOptions,
  ComponentsManifestsMap,
  CreateFromComponentsOptions,
  Registries,
  Registry,
  // PackageManagerResolveRemoteVersionOptions,
  ResolvedPackageVersion,
} from '@teambit/dependency-resolver';
import { ComponentMap } from '@teambit/component';
import { unlinkSync, existsSync } from 'fs-extra';
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
import { npath, PortablePath } from '@yarnpkg/fslib';
import { PkgMain } from '@teambit/pkg';
import userHome from 'user-home';

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
      dedupe: true,
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
    const config = await this.computeConfiguration(rootDirPath, installOptions);

    const project = new Project(rootDirPath, { configuration: config });
    // @ts-ignore
    project.setupResolutions();
    const rootWs = await this.createWorkspace(
      rootDir,
      project,
      workspaceManifest.toJson({
        includeDir: true,
        copyPeerToRuntime: installOptions.copyPeerToRuntimeOnRoot,
      }).manifest
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

    if (installReport.hasErrors()) process.exit(installReport.exitCode());

    // TODO: check if package.json and link files generation can be prevented through the yarn API or
    // mock the files by hooking to `xfs`.
    this.clean(rootDir, componentDirectoryMap, installOptions);
  }

  private clean(
    rootDir: string,
    componentDirectoryMap: ComponentMap<string>,
    installOptions: PackageManagerInstallOptions
  ) {
    return componentDirectoryMap.toArray().forEach(([component, dir]) => {
      const packageName = this.pkg.getPackageName(component);
      const modulePath = resolve(join(rootDir, 'node_modules', packageName));
      const packageJsonPath = resolve(join(dir, 'package.json'));
      if (installOptions.cacheRootDir) unlinkSync(packageJsonPath);
      const exists = existsSync(modulePath);
      if (exists) return; // TODO: check if this can be done through the yarn API.
      unlinkSync(modulePath);
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

  private async getScopedRegistries(registries: Registries) {
    const scopedRegistries = Object.keys(registries.scopes).reduce((acc, scopeName) => {
      const regDef = registries.scopes[scopeName];
      const authProp = this.getAuthProp(regDef);
      acc[scopeName] = {
        npmRegistryServer: regDef.uri,
        npmAlwaysAuth: regDef.alwaysAuth,
      };
      if (authProp) {
        acc[scopeName][authProp.keyName] = authProp.value;
      }

      return acc;
    }, {});
    return scopedRegistries;
  }

  private getAuthProp(registry: Registry) {
    if (registry.token) {
      return {
        keyName: 'npmAuthToken',
        value: registry.token,
      };
    }
    if (registry.baseToken) {
      return {
        keyName: 'npmAuthIdent',
        value: registry.baseToken,
      };
    }
    return undefined;
  }

  private getCacheFolder(options: PackageManagerInstallOptions) {
    return options.cacheRootDir ? `${options.cacheRootDir}/.yarn/cache` : `${userHome}/.yarn/cache`;
  }

  // TODO: implement this to automate configuration.
  private async computeConfiguration(rootDirPath: PortablePath, installOptions: PackageManagerInstallOptions) {
    const registries = await this.depResolver.getRegistries();
    const pluginConfig = getPluginConfiguration();
    const config = await Configuration.find(rootDirPath, pluginConfig);
    const scopedRegistries = await this.getScopedRegistries(registries);
    const defaultRegistry = registries.defaultRegistry;
    const defaultAuthProp = this.getAuthProp(defaultRegistry);
    const cacheFolder = this.getCacheFolder(installOptions);

    const data = {
      nodeLinker: 'node-modules',
      installStatePath: resolve(`${rootDirPath}/.yarn/install-state.gz`),
      cacheFolder,
      pnpDataPath: resolve(`${rootDirPath}/.pnp.meta.json`),
      bstatePath: resolve(`${rootDirPath}/.yarn/build-state.yml`),
      npmScopes: scopedRegistries,
      virtualFolder: `${rootDirPath}/.yarn/$$virtual`,
      npmRegistryServer: defaultRegistry.uri || 'https://registry.yarnpkg.com',
      npmAlwaysAuth: defaultRegistry.alwaysAuth,
      // enableInlineBuilds: true,
      globalFolder: `${rootDirPath}/.yarn/global`,
    };
    if (defaultAuthProp) {
      data[defaultAuthProp.keyName] = defaultAuthProp.value;
    }
    // TODO: node-modules is hardcoded now until adding support for pnp.
    config.use('<bit>', data, rootDirPath, {});

    return config;
  }

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

  // TODO: implement this with either the yarn API or add a default resolver in the dep resolver.
  async resolveRemoteVersion(
    packageName: string
    // options: PackageManagerResolveRemoteVersionOptions
  ): Promise<ResolvedPackageVersion> {
    const parsedPackage = parsePackageName(packageName);
    const parsedVersion = parsedPackage.version;
    if (parsedVersion && semver.valid(parsedVersion)) {
      return {
        packageName: parsedPackage.name,
        version: parsedVersion,
        isSemver: true,
      };
    }
    const { stdout } = await execa('npm', ['view', packageName, 'version'], {});

    return {
      packageName: parsedPackage.name,
      version: stdout,
      isSemver: true,
    };
  }
}
