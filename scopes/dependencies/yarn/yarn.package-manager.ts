import parsePackageName from 'parse-package-name';
import {
  extendWithComponentsFromDir,
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
import { join, relative, resolve } from 'path';
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
  WorkspaceResolver,
} from '@yarnpkg/core';
import { getPluginConfiguration } from '@yarnpkg/cli';
import { npath, PortablePath } from '@yarnpkg/fslib';
import { Resolution } from '@yarnpkg/parsers';
import npmPlugin from '@yarnpkg/plugin-npm';
import parseOverrides from '@pnpm/parse-overrides';
import { PkgMain } from '@teambit/pkg';
import userHome from 'user-home';
import { Logger } from '@teambit/logger';
import versionSelectorType from 'version-selector-type';
import YAML from 'yaml';
import { createRootComponentsDir } from './create-root-components-dir';

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
    const config = await this.computeConfiguration(rootDirPath, cacheDir, {
      nodeLinker: installOptions.nodeLinker,
      packageManagerConfigRootDir: installOptions.packageManagerConfigRootDir,
    });

    const project = new Project(rootDirPath, { configuration: config });

    const rootManifest = workspaceManifest.toJsonWithDir({
      copyPeerToRuntime: installOptions.copyPeerToRuntimeOnRoot,
      installPeersFromEnvs: installOptions.installPeersFromEnvs,
    }).manifest;
    if (installOptions.rootComponents?.length) {
      const rootComponentDeps = await createRootComponentsDir(
        this.depResolver,
        rootDir,
        installOptions.rootComponents!,
        componentDirectoryMap
      );
      rootManifest.dependencies = {
        ...rootManifest.dependencies,
        ...rootComponentDeps,
      };
    }

    // @ts-ignore
    project.setupResolutions();
    const rootWs = await this.createWorkspace(rootDir, project, rootManifest, installOptions.overrides);
    if (installOptions.rootComponents?.length) {
      rootWs.manifest.installConfig = {
        hoistingLimits: 'dependencies',
      };
    }

    // const manifests = Array.from(workspaceManifest.componentsManifestsMap.entries());
    const manifests = this.computeComponents(
      workspaceManifest.componentsManifestsMap,
      componentDirectoryMap,
      installOptions.copyPeerToRuntimeOnComponents
    );
    await extendWithComponentsFromDir(rootDir, manifests);

    this.logger.debug('root manifest for installation', rootManifest);
    this.logger.debug('components manifests for installation', manifests);

    const workspacesIdents = {};

    const workspacesP = Object.keys(manifests).map(async (path) => {
      const manifest = manifests[path];
      const workspace = await this.createWorkspace(path, project, manifest);
      const workspaceIdentHash = workspace.locator.identHash;
      //
      if (workspacesIdents[workspaceIdentHash]) {
        this.logger.debug(
          `overriding internal workspace fields to prevent duplications for workspace ${workspace.cwd}`
        );
        this.overrideInternalWorkspaceParams(workspace);
      }
      workspacesIdents[workspace.locator.identHash] = true;
      return workspace;
    });

    const workspaces = await Promise.all(workspacesP);

    this.setupWorkspaces(project, workspaces.concat(rootWs));

    const cache = await Cache.find(config);
    // const existingPackageJsons = await this.backupPackageJsons(rootDir, componentDirectoryMap);

    const installReport = await StreamReport.start(
      {
        stdout: process.stdout,
        configuration: config,
      },
      async (report) => {
        await project.install({
          persistProject: false,
          cache,
          report,
        });
        await project.persistLockfile();
      }
    );

    // TODO: check if package.json and link files generation can be prevented through the yarn API or
    // mock the files by hooking to `xfs`.
    // see the persistProject: false above
    // await this.restorePackageJsons(existingPackageJsons);

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

  private async createWorkspace(rootDir: string, project: Project, manifest: any, overrides?: Record<string, string>) {
    const wsPath = npath.toPortablePath(rootDir);
    const name = manifest.name || 'workspace';

    const ws = new Workspace(wsPath, { project });
    await ws.setup();
    const identity = structUtils.parseIdent(name);
    // const needOverrideInternal = !!ws.manifest.name && !!manifest.name;
    ws.manifest.name = identity;
    ws.manifest.version = manifest.version;
    ws.manifest.dependencies = this.computeDeps(manifest.dependencies);
    ws.manifest.devDependencies = this.computeDeps(manifest.devDependencies);
    ws.manifest.peerDependencies = this.computeDeps(manifest.peerDependencies);
    if (overrides) {
      ws.manifest.resolutions = convertOverridesToResolutions(overrides);
    }

    // if (needOverrideInternal) this.overrideInternalWorkspaceParams(ws);

    return ws;
  }

  /**
   * This is used to handle cases where in the capsules dirs we have the same component with different versions
   * The yarn ident is calculated by the manifest (package.json) name if exist
   * in our case for the same component with different versions we will get the same ident which will result errors later.
   * This is make sense in the original case of yarn workspace (it make sense you don't have 2 workspace with same name)
   * However in our case it doesn't make sense.
   * This function will make sure the ident will use the version as well
   * @param ws
   */
  private overrideInternalWorkspaceParams(ws: Workspace) {
    const ident = structUtils.makeIdent(
      ws.manifest.name?.scope || null,
      `${ws.manifest.name?.name}-${ws.manifest.version}`
    );

    ws.manifest.name = ident;

    // @ts-expect-error: It's ok to initialize it now, even if it's readonly (setup is called right after construction)
    ws.locator = structUtils.makeLocator(ident, ws.reference);

    // @ts-expect-error: It's ok to initialize it now, even if it's readonly (setup is called right after construction)
    ws.anchoredDescriptor = structUtils.makeDescriptor(ws.locator, `${WorkspaceResolver.protocol}${ws.relativeCwd}`);

    // @ts-expect-error: It's ok to initialize it now, even if it's readonly (setup is called right after construction)
    ws.anchoredLocator = structUtils.makeLocator(ws.locator, `${WorkspaceResolver.protocol}${ws.relativeCwd}`);
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
  private async computeConfiguration(
    rootDirPath: PortablePath,
    cacheFolder: string,
    options: {
      nodeLinker?: 'hoisted' | 'isolated';
      packageManagerConfigRootDir?: string;
    }
  ): Promise<Configuration> {
    const registries = await this.depResolver.getRegistries();
    const proxyConfig = await this.depResolver.getProxyConfig();
    const pluginConfig = getPluginConfiguration();
    let startingCwd: PortablePath;
    if (options.packageManagerConfigRootDir) {
      startingCwd = npath.toPortablePath(options.packageManagerConfigRootDir);
    } else {
      startingCwd = rootDirPath;
    }
    const config = await Configuration.find(startingCwd, pluginConfig);
    const scopedRegistries = await this.getScopedRegistries(registries);
    const defaultRegistry = registries.defaultRegistry;
    const defaultAuthProp = this.getAuthProp(defaultRegistry);

    const data = {
      nodeLinker: options.nodeLinker === 'isolated' ? 'pnpm' : 'node-modules',
      installStatePath: `${rootDirPath}/.yarn/install-state.gz`,
      cacheFolder,
      pnpDataPath: `${rootDirPath}/.pnp.meta.json`,
      npmScopes: scopedRegistries,
      virtualFolder: `${rootDirPath}/.yarn/__virtual__`,
      npmRegistryServer: defaultRegistry.uri || 'https://registry.yarnpkg.com',
      npmAlwaysAuth: defaultRegistry.alwaysAuth,
      httpProxy: proxyConfig?.httpProxy,
      httpsProxy: proxyConfig?.httpsProxy,
      enableStrictSsl: proxyConfig.strictSSL,
      // enableInlineBuilds: true,
      globalFolder: `${userHome}/.yarn/global`,

      // TODO: check about support for the following: (see more here - https://github.com/yarnpkg/berry/issues/1434#issuecomment-801449010)
      // ca?: string;
      // cert?: string;
      // key?: string;
      // noProxy?: boolean | string;
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
    const versionType = parsedVersion && versionSelectorType(parsedVersion)?.type;
    if (versionType === 'version') {
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
    const config = await this.computeConfiguration(rootDirPath, cacheDir, {
      packageManagerConfigRootDir: options.packageManagerConfigRootDir,
    });

    const project = new Project(rootDirPath, { configuration: config });
    const report = new LightReport({ configuration: config, stdout: process.stdout });

    // Handle cases when the version is a dist tag like dev / latest for example bit install lodash@latest
    if (versionType === 'tag') {
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

  async getInjectedDirs(rootDir: string, componentDir: string, packageName: string): Promise<string[]> {
    const modulesDir = join(rootDir, 'node_modules');
    relative(modulesDir, componentDir);
    let yarnStateContent!: string;
    try {
      yarnStateContent = await fs.readFile(join(modulesDir, '.yarn-state.yml'), 'utf-8');
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
    }
    const yarnState = YAML.parse(yarnStateContent) as Record<string, { locations: string[] }>;
    const injectedDirs: string[] = [];
    for (const [key, { locations }] of Object.entries(yarnState)) {
      if (key.startsWith(`${packageName}@`) || key.startsWith(`${packageName}__root@`)) {
        for (const location of locations) {
          injectedDirs.push(location);
        }
      }
    }
    return injectedDirs;
  }
}

function convertOverridesToResolutions(
  overrides: Record<string, string>
): Array<{ pattern: Resolution; reference: string }> {
  const parsedOverrides = parseOverrides(overrides);
  return parsedOverrides.map((override) => ({
    pattern: {
      from: override.parentPkg ? toYarnResolutionSelector(override.parentPkg) : undefined,
      descriptor: toYarnResolutionSelector(override.targetPkg),
    },
    reference: override.newPref,
  }));
}

function toYarnResolutionSelector({ name, pref }: { name: string; pref?: string }) {
  return {
    fullName: name,
    description: pref,
  };
}
