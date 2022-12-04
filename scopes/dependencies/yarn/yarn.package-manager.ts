import parsePackageName from 'parse-package-name';
import {
  extendWithComponentsFromDir,
  InstallationContext,
  DependencyResolverMain,
  PackageManager,
  PackageManagerInstallOptions,
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
import { parseOverrides } from '@pnpm/parse-overrides';
import { omit } from 'lodash';
import userHome from 'user-home';
import { Logger } from '@teambit/logger';
import versionSelectorType from 'version-selector-type';
import YAML from 'yaml';
import { createRootComponentsDir } from './create-root-components-dir';

type BackupJsons = {
  [path: string]: Buffer | undefined;
};

export class YarnPackageManager implements PackageManager {
  constructor(private depResolver: DependencyResolverMain, private logger: Logger) {}

  async install(
    { rootDir, manifests, componentDirectoryMap }: InstallationContext,
    installOptions: PackageManagerInstallOptions = {}
  ): Promise<void> {
    this.logger.setStatusLine('installing dependencies');

    const rootDirPath = npath.toPortablePath(rootDir);
    const config = await this.computeConfiguration(rootDirPath, {
      cacheRootDir: installOptions.cacheRootDir,
      nodeLinker: installOptions.nodeLinker,
      packageManagerConfigRootDir: installOptions.packageManagerConfigRootDir,
    });

    const project = new Project(rootDirPath, { configuration: config });

    // @ts-ignore
    project.setupResolutions();
    if (installOptions.rootComponentsForCapsules && !installOptions.useNesting) {
      installOptions.overrides = {
        ...installOptions.overrides,
        ...this._createLocalDirectoryOverrides(rootDir, componentDirectoryMap),
      };
    }
    const workspaceManifest = manifests[rootDir];
    manifests = omit(manifests, rootDir);
    const rootWs = await this.createWorkspace(rootDir, project, workspaceManifest, installOptions.overrides);
    if (installOptions.rootComponents) {
      rootWs.manifest.installConfig = {
        hoistingLimits: 'dependencies',
      };
    }

    if (installOptions.rootComponents) {
      // Manifests are extended with "wrapper components"
      // that group all workspace components with their dependencies and peer dependencies.
      manifests = {
        ...(await createRootComponentsDir({
          depResolver: this.depResolver,
          rootDir,
          componentDirectoryMap,
        })),
        ...Object.entries(manifests).reduce((acc, [dir, manifest]) => {
          acc[dir] = {
            ...manifest,
            dependencies: {
              ...manifest.peerDependencies,
              ...manifest['defaultPeerDependencies'], // eslint-disable-line
              ...manifest.dependencies,
            },
          };
          return acc;
        }, {}),
      };
    } else if (installOptions.useNesting) {
      manifests[rootDir] = workspaceManifest;
      // Nesting is used for scope aspect capsules.
      // In a capsule, all peer dependencies should be installed,
      // so we make runtime dependencies from peer dependencies.
      manifests[rootDir].dependencies = {
        ...manifests[rootDir].peerDependencies,
        ...manifests[rootDir]['defaultPeerDependencies'], // eslint-disable-line
        ...manifests[rootDir].dependencies,
      };
    } else if (installOptions.rootComponentsForCapsules) {
      await updateManifestsForInstallationInWorkspaceCapsules(manifests);
    } else {
      manifests = await extendWithComponentsFromDir(rootDir, manifests);
    }

    this.logger.debug(`running installation in root dir ${rootDir}`);
    this.logger.debug('root manifest for installation', workspaceManifest);
    this.logger.debug('components manifests for installation', manifests);

    const workspacesP = Object.keys(manifests).map(async (path) => {
      const manifest = manifests[path];
      const workspace = await this.createWorkspace(path, project, manifest);
      return workspace;
    });

    const workspaces = await Promise.all(workspacesP);

    if (!installOptions.rootComponents && !installOptions.rootComponentsForCapsules && !installOptions.useNesting) {
      const workspacesIdents = {};
      for (const workspace of workspaces) {
        const workspaceIdentHash = workspace.locator.identHash;
        if (workspacesIdents[workspaceIdentHash]) {
          this.logger.debug(
            `overriding internal workspace fields to prevent duplications for workspace ${workspace.cwd}`
          );
          this.overrideInternalWorkspaceParams(workspace);
        }
        workspacesIdents[workspace.locator.identHash] = true;
      }
    }

    if (!manifests[rootDir]) {
      workspaces.push(rootWs);
    }
    this.setupWorkspaces(project, workspaces);

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

  /**
   * Every component is overriden with a local directory of that component.
   * So the component will be installed from the local directory, not from the registry.
   */
  private _createLocalDirectoryOverrides(
    rootDir: string,
    componentDirectoryMap: ComponentMap<string>
  ): Record<string, string> {
    const overrides = {};
    Array.from(componentDirectoryMap.hashMap.entries()).forEach(([, [component, path]]) => {
      const name = this.depResolver.getPackageName(component);
      overrides[name] = `file:${relative(rootDir, path)}`;
    });
    return overrides;
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
    ws.manifest.installConfig = manifest.installConfig;
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

  private getGlobalFolder(baseDir: string = userHome) {
    return `${baseDir}/.yarn/global`;
  }

  // TODO: implement this to automate configuration.
  private async computeConfiguration(
    rootDirPath: PortablePath,
    options: {
      cacheRootDir?: string;
      nodeLinker?: 'hoisted' | 'isolated';
      packageManagerConfigRootDir?: string;
    }
  ): Promise<Configuration> {
    const registries = await this.depResolver.getRegistries();
    const proxyConfig = await this.depResolver.getProxyConfig();
    const networkConfig = await this.depResolver.getNetworkConfig();
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

    const globalFolder = this.getGlobalFolder(options.cacheRootDir);
    const data = {
      enableGlobalCache: true,
      nodeLinker: options.nodeLinker === 'isolated' ? 'pnpm' : 'node-modules',
      installStatePath: `${rootDirPath}/.yarn/install-state.gz`,
      cacheFolder: join(globalFolder, 'cache'),
      npmScopes: scopedRegistries,
      virtualFolder: `${rootDirPath}/.yarn/__virtual__`,
      npmRegistryServer: defaultRegistry.uri || 'https://registry.yarnpkg.com',
      npmAlwaysAuth: defaultRegistry.alwaysAuth,
      httpProxy: proxyConfig?.httpProxy,
      httpsProxy: proxyConfig?.httpsProxy,
      enableStrictSsl: networkConfig?.strictSSL,
      // enableInlineBuilds: true,
      globalFolder,
      // We need to disable self-references as say create circular symlinks.
      nmSelfReferences: false,
      pnpUnpluggedFolder: `${rootDirPath}/.yarn/unplugged`,
      // Hardlink the files from the global content-addressable store.
      // This increases the speed of installation and reduces disk space usage.
      nmMode: 'hardlinks-global',

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
    config.use('<bit>', data, rootDirPath, { overwrite: true });

    // Yarn  v4 stopped automatically creating the cache folder.
    // If we don't do it ourselves, Yarn will fail with: "ENOENT: no such file or directory, copyfile..."
    await fs.mkdir(config.values.get('cacheFolder'), { recursive: true });

    return config;
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
    const config = await this.computeConfiguration(rootDirPath, {
      cacheRootDir: options.cacheRootDir,
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
    const candidates = await resolver.getCandidates(descriptor, {}, resolveOptions);
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

  supportsDedupingOnExistingRoot(): boolean {
    return true;
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

/**
 * This function prepares the component manifests for installation inside a capsule.
 * Inside a capsule, all peer dependencies of the component should be installed.
 * So peer dependencies are added to the manifest as runtime dependencies.
 * Also, the package.json files are update to contain other component dependencies
 * in dependencies as local "file:" dependencies.
 */
async function updateManifestsForInstallationInWorkspaceCapsules(manifests: { [key: string]: any }) {
  await Promise.all(
    Object.entries(manifests).map(async ([dir, manifest]) => {
      const pkgJsonPath = join(dir, 'package.json');
      const pkgJson = await fs.readJson(pkgJsonPath);
      // We need to write the package.json files because they need to contain the workspace dependencies.
      // When packages are installed via the "file:" protocol, Yarn reads their package.json files
      // from the file system even if they are from the workspace.
      await fs.writeJson(
        pkgJsonPath,
        {
          ...pkgJson,
          dependencies: manifest.dependencies,
        },
        { spaces: 2 }
      );
      manifest.dependencies = {
        ...manifest.peerDependencies,
        ...manifest.defaultPeerDependencies,
        ...manifest.dependencies,
      };
      manifest.installConfig = {
        hoistingLimits: 'workspaces',
      };
    })
  );
}
