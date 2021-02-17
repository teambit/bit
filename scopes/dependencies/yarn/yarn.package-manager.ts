import * as semver from 'semver';
import parsePackageName from 'parse-package-name';
import {
  WorkspacePolicy,
  DependencyResolverMain,
  PackageManager,
  PackageManagerInstallOptions,
  ComponentsManifestsMap,
  CreateFromComponentsOptions,
  Registries,
  Registry,
  PackageManagerResolveRemoteVersionOptions,
  ResolvedPackageVersion,
} from '@teambit/dependency-resolver';
import { ComponentMap, Component } from '@teambit/component';
import fs from 'fs-extra';
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
  ResolveOptions,
  LightReport,
} from '@yarnpkg/core';
import { getPluginConfiguration } from '@yarnpkg/cli';
import { npath, PortablePath } from '@yarnpkg/fslib';
import npmPlugin from '@yarnpkg/plugin-npm';
import { PkgMain } from '@teambit/pkg';
import userHome from 'user-home';
import { Logger } from '@teambit/logger';

type BackupJsons = {
  [path: string]: Buffer | undefined;
};

export class YarnPackageManager implements PackageManager {
  constructor(private depResolver: DependencyResolverMain, private pkg: PkgMain, private logger: Logger) {}

  async install(
    rootDir: string,
    rootPolicy: WorkspacePolicy,
    componentDirectoryMap: ComponentMap<string>,
    installOptions: PackageManagerInstallOptions = {}
  ): Promise<void> {
    this.logger.setStatusLine('installing dependencies');
    const options: CreateFromComponentsOptions = {
      filterComponentsFromManifests: true,
      createManifestForComponentsWithoutDependencies: true,
      dedupe: true,
      dependencyFilterFn: installOptions.dependencyFilterFn,
    };
    const components = componentDirectoryMap.components;
    const workspaceManifest = await this.depResolver.getWorkspaceManifest(
      undefined,
      undefined,
      rootPolicy,
      rootDir,
      components,
      options
    );

    const rootDirPath = npath.toPortablePath(rootDir);
    const cacheDir = this.getCacheFolder(installOptions.cacheRootDir);
    const config = await this.computeConfiguration(rootDirPath, cacheDir);

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
    const existingPackageJsons = await this.backupPackageJsons(rootDir, componentDirectoryMap);

    const installReport = await StreamReport.start(
      {
        stdout: process.stdout,
        configuration: config,
      },
      async (report) => {
        await project.install({
          // this should be uncomment in order to not mutate the root package.json and / or the package json in components
          // Currently it's commented since it produce an error in the link step of "Error: Manifest not found"
          // persistProject: false,
          cache,
          report,
        });
      }
    );

    // TODO: check if package.json and link files generation can be prevented through the yarn API or
    // mock the files by hooking to `xfs`.
    // see the persistProject: false above
    await this.restorePackageJsons(existingPackageJsons);

    if (installReport.hasErrors()) process.exit(installReport.exitCode());

    this.logger.consoleSuccess('installing dependencies');
  }

  private getPackageJsonPath(dir: string): string {
    const packageJsonPath = join(dir, 'package.json');
    return packageJsonPath;
  }

  private async backupPackageJsons(rootDir: string, componentDirectoryMap: ComponentMap<string>): Promise<BackupJsons> {
    const result: BackupJsons = {};
    const rootPackageJsonPath = this.getPackageJsonPath(rootDir);
    result[rootPackageJsonPath] = await this.getFileToBackup(rootPackageJsonPath);
    const componentsBackupsP = componentDirectoryMap.toArray().map(async ([component, dir]) => {
      const { packageJsonPath, file } = await this.getComponentPackageJsonToBackup(component, dir);
      result[packageJsonPath] = file;
    });
    await Promise.all(componentsBackupsP);
    return result;
  }

  private async restorePackageJsons(backupJsons: BackupJsons): Promise<void | undefined> {
    const promises = Object.entries(backupJsons).map(async ([packageJsonPath, file]) => {
      const exists = await fs.pathExists(packageJsonPath);
      // if there is no backup it means it wasn't there before and should be deleted
      if (!file) {
        if (exists) {
          return fs.remove(packageJsonPath);
        }
        return undefined;
      }
      return fs.writeFile(packageJsonPath, file);
    });
    await Promise.all(promises);
  }

  private async getFileToBackup(packageJsonPath: string): Promise<Buffer | undefined> {
    const exists = await fs.pathExists(packageJsonPath);
    if (!exists) {
      return undefined;
    }
    const existingFile = await fs.readFile(packageJsonPath);
    return existingFile;
  }

  private async getComponentPackageJsonToBackup(
    component: Component,
    dir: string
  ): Promise<{ packageJsonPath: string; file: Buffer | undefined }> {
    const packageJsonPath = resolve(join(dir, 'package.json'));
    const result = {
      packageJsonPath,
      file: await this.getFileToBackup(packageJsonPath),
    };
    return result;
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

  private getCacheFolder(baseDir: string = userHome) {
    return `${baseDir}/.yarn/cache`;
  }

  // TODO: implement this to automate configuration.
  private async computeConfiguration(rootDirPath: PortablePath, cacheFolder: string): Promise<Configuration> {
    const registries = await this.depResolver.getRegistries();
    const proxyConfig = await this.depResolver.getProxyConfig();
    const pluginConfig = getPluginConfiguration();
    const config = await Configuration.find(rootDirPath, pluginConfig);
    const scopedRegistries = await this.getScopedRegistries(registries);
    const defaultRegistry = registries.defaultRegistry;
    const defaultAuthProp = this.getAuthProp(defaultRegistry);

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
      httpProxy: proxyConfig?.httpProxy,
      httpsProxy: proxyConfig?.httpsProxy,
      // enableInlineBuilds: true,
      globalFolder: `${userHome}/.yarn/global`,
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

  async resolveRemoteVersion(
    packageName: string,
    options: PackageManagerResolveRemoteVersionOptions
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
    if (!npmPlugin.resolvers) {
      throw new Error('npm resolvers for yarn API not found');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_NpmRemapResolver, NpmSemverResolver, NpmTagResolver] = npmPlugin.resolvers;
    let resolver = new NpmSemverResolver();
    const ident = structUtils.parseIdent(parsedPackage.name);
    let range = 'npm:*';
    const rootDirPath = npath.toPortablePath(options.rootDir);
    const cacheDir = this.getCacheFolder(options.cacheRootDir);
    const config = await this.computeConfiguration(rootDirPath, cacheDir);

    const project = new Project(rootDirPath, { configuration: config });
    const report = new LightReport({ configuration: config, stdout: process.stdout });

    // Handle cases when the version is a dist tag like dev / latest for example bit install lodash@latest
    if (parsedPackage.version) {
      resolver = new NpmTagResolver();
      range = `npm:${parsedPackage.version}`;
    }
    const descriptor = structUtils.makeDescriptor(ident, range);

    // @ts-ignore
    project.setupResolutions();
    const resolveOptions: ResolveOptions = {
      project,
      resolver,
      report,
    };
    // const candidates = await resolver.getCandidates(descriptor, new Map(), resolveOptions);
    const candidates = await resolver.getCandidates(descriptor, new Map(), resolveOptions);
    const parsedRange = structUtils.parseRange(candidates[0].reference);
    const version = parsedRange.selector;
    return {
      packageName: parsedPackage.name,
      version,
      isSemver: true,
    };
  }
}
