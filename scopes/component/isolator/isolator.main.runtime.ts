import { MainRuntime } from '@teambit/cli';
import { Component, ComponentMap } from '@teambit/component';
import { DependencyResolverAspect, DependencyResolverMain, LinkingOptions } from '@teambit/dependency-resolver';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { BitId, BitIds } from 'bit-bin/dist/bit-id';
import { CACHE_ROOT, DEPENDENCIES_FIELDS, PACKAGE_JSON } from 'bit-bin/dist/constants';
import ConsumerComponent from 'bit-bin/dist/consumer/component';
import PackageJsonFile from 'bit-bin/dist/consumer/component/package-json-file';
import componentIdToPackageName from 'bit-bin/dist/utils/bit/component-id-to-package-name';
import { PathOsBasedAbsolute } from 'bit-bin/dist/utils/path';
import { Scope } from 'bit-bin/dist/scope';
import fs from 'fs-extra';
import hash from 'object-hash';
import path from 'path';
import { equals, map } from 'ramda';
import BitMap from 'bit-bin/dist/consumer/bit-map';
import ComponentWriter, { ComponentWriterProps } from 'bit-bin/dist/consumer/component-ops/component-writer';
import { Capsule } from './capsule';
import CapsuleList from './capsule-list';
import { IsolatorAspect } from './isolator.aspect';
// import { copyBitBinToCapsuleRoot } from './symlink-bit-bin-to-capsules';
import { symlinkBitBinToCapsules } from './symlink-bit-bin-to-capsules';
import { symlinkOnCapsuleRoot, symlinkDependenciesToCapsules } from './symlink-dependencies-to-capsules';

const CAPSULES_BASE_DIR = path.join(CACHE_ROOT, 'capsules'); // TODO: move elsewhere

export type ListResults = {
  workspace: string;
  capsules: string[];
};

export type IsolateComponentsInstallOptions = {
  installPackages?: boolean; // default: true
  // TODO: add back when depResolver.getInstaller support it
  // packageManager?: string;
  dedupe?: boolean;
  copyPeerToRuntimeOnComponents?: boolean;
  copyPeerToRuntimeOnRoot?: boolean;
};

export type IsolateComponentsOptions = {
  name?: string;
  /**
   * the capsule root-dir based on a *hash* of this baseDir, not on the baseDir itself.
   */
  baseDir?: string;

  /**
   * create a new capsule with a random string attached to the path suffix
   */
  alwaysNew?: boolean;

  /**
   * installation options
   */
  installOptions?: IsolateComponentsInstallOptions;

  linkingOptions?: LinkingOptions;

  /**
   * delete the capsule rootDir first. it makes sure that the isolation process starts fresh with
   * no previous capsules. for build and tag this is true.
   */
  emptyRootDir?: boolean;

  /**
   * skip the reproduction of the capsule in case it exists.
   */
  skipIfExists?: boolean;

  /**
   * get existing capsule without doing any changes, no writes, no installations.
   */
  getExistingAsIs?: boolean;

  /**
   * include all dependencies the capsule root context.
   */
  includeDeps?: boolean;
};

const DEFAULT_ISOLATE_INSTALL_OPTIONS: IsolateComponentsInstallOptions = {
  installPackages: true,
  dedupe: true,
  copyPeerToRuntimeOnComponents: false,
  copyPeerToRuntimeOnRoot: true,
};

export class IsolatorMain {
  static runtime = MainRuntime;
  static dependencies = [DependencyResolverAspect, LoggerAspect];
  static defaultConfig = {};
  static async provider([dependencyResolver, loggerExtension]: [DependencyResolverMain, LoggerMain]): Promise<
    IsolatorMain
  > {
    const logger = loggerExtension.createLogger(IsolatorAspect.id);
    const isolator = new IsolatorMain(dependencyResolver, logger);
    return isolator;
  }
  constructor(private dependencyResolver: DependencyResolverMain, private logger: Logger) {}

  public async isolateComponents(
    components: Component[],
    opts: IsolateComponentsOptions,
    legacyScope?: Scope
  ): Promise<CapsuleList> {
    const config = { installPackages: true, ...opts };
    const capsulesDir = this.getCapsulesRootDir(opts.baseDir as string);
    if (opts.emptyRootDir) {
      await fs.emptyDir(capsulesDir);
    }
    const capsules = await createCapsulesFromComponents(components, capsulesDir, config);
    const capsuleList = CapsuleList.fromArray(capsules);
    if (opts.getExistingAsIs) {
      return capsuleList;
    }

    if (opts.skipIfExists) {
      const existingCapsules = CapsuleList.fromArray(
        capsuleList.filter((capsule) => capsule.fs.existsSync('package.json'))
      );

      if (existingCapsules.length === capsuleList.length) return existingCapsules;
    }
    const capsulesWithPackagesData = await getCapsulesPreviousPackageJson(capsules);

    await this.writeComponentsInCapsules(components, capsuleList, legacyScope);
    updateWithCurrentPackageJsonData(capsulesWithPackagesData, capsules);
    const installOptions = Object.assign({}, DEFAULT_ISOLATE_INSTALL_OPTIONS, opts.installOptions || {});
    if (installOptions.installPackages) {
      const capsulesToInstall: Capsule[] = capsulesWithPackagesData
        .filter((capsuleWithPackageData) => {
          const packageJsonHasChanged = wereDependenciesInPackageJsonChanged(capsuleWithPackageData);
          // @todo: when a component is tagged, it changes all package-json of its dependents, but it
          // should not trigger any "npm install" because they dependencies are symlinked by us
          return packageJsonHasChanged;
        })
        .map((capsuleWithPackageData) => capsuleWithPackageData.capsule);
      // await this.dependencyResolver.capsulesInstall(capsulesToInstall, { packageManager: config.packageManager });
      const installer = this.dependencyResolver.getInstaller({
        rootDir: capsulesDir,
        linkingOptions: opts.linkingOptions,
        cacheRootDirectory: opts.includeDeps ? capsulesDir : undefined,
      });
      // When using isolator we don't want to use the policy defined in the workspace directly,
      // we only want to instal deps from components and the peer from the workspace

      const workspacePolicy = this.dependencyResolver.getWorkspacePolicy();
      const peerOnlyPolicy = workspacePolicy.byLifecycleType('peer');
      const packageManagerInstallOptions = {
        dedupe: installOptions.dedupe,
        copyPeerToRuntimeOnComponents: installOptions.copyPeerToRuntimeOnComponents,
        copyPeerToRuntimeOnRoot: installOptions.copyPeerToRuntimeOnRoot,
      };
      await installer.install(capsulesDir, peerOnlyPolicy, this.toComponentMap(capsules), packageManagerInstallOptions);
      await symlinkOnCapsuleRoot(capsuleList, this.logger, capsulesDir);
      await symlinkDependenciesToCapsules(capsulesToInstall, capsuleList, this.logger);
      // TODO: this is a hack to have access to the bit bin project in order to access core extensions from user extension
      // TODO: remove this after exporting core extensions as components
      await symlinkBitBinToCapsules(capsulesToInstall, this.logger);
      // await copyBitBinToCapsuleRoot(capsulesDir, this.logger);
    }

    // rewrite the package-json with the component dependencies in it. the original package.json
    // that was written before, didn't have these dependencies in order for the package-manager to
    // be able to install them without crushing when the versions don't exist yet
    capsulesWithPackagesData.forEach((capsuleWithPackageData) => {
      capsuleWithPackageData.capsule.fs.writeFileSync(
        PACKAGE_JSON,
        JSON.stringify(capsuleWithPackageData.currentPackageJson, null, 2)
      );
    });

    return capsuleList;
  }

  private async writeComponentsInCapsules(components: Component[], capsuleList: CapsuleList, legacyScope?: Scope) {
    const legacyComponents = components.map((component) => component.state._consumer.clone());
    const allIds = BitIds.fromArray(legacyComponents.map((c) => c.id));
    await Promise.all(
      components.map(async (component) => {
        const capsule = capsuleList.getCapsule(component.id);
        if (!capsule) return;
        const params = this.getComponentWriteParams(component.state._consumer, allIds, legacyScope);
        const componentWriter = new ComponentWriter(params);
        await componentWriter.populateComponentsFilesToWrite();
        await component.state._consumer.dataToPersist.persistAllToCapsule(capsule, { keepExistingCapsule: true });
      })
    );
  }

  private getComponentWriteParams(
    component: ConsumerComponent,
    ids: BitIds,
    legacyScope?: Scope
  ): ComponentWriterProps {
    return {
      component,
      // @ts-ignore
      bitMap: new BitMap(),
      writeToPath: '.',
      origin: 'IMPORTED',
      consumer: undefined,
      scope: legacyScope,
      override: false,
      writePackageJson: true,
      writeConfig: false,
      ignoreBitDependencies: ids,
      excludeRegistryPrefix: false,
      isolated: true,
    };
  }

  private toComponentMap(capsules: Capsule[]): ComponentMap<string> {
    const tuples: [Component, string][] = capsules.map((capsule) => {
      return [capsule.component, capsule.path];
    });

    return ComponentMap.create(tuples);
  }

  async list(workspacePath: string): Promise<ListResults> {
    try {
      const workspaceCapsuleFolder = this.getCapsulesRootDir(workspacePath);
      const capsules = await fs.readdir(workspaceCapsuleFolder);
      const capsuleFullPaths = capsules.map((c) => path.join(workspaceCapsuleFolder, c));
      return {
        workspace: workspacePath,
        capsules: capsuleFullPaths,
      };
    } catch (e) {
      if (e.code === 'ENOENT') {
        return { workspace: workspacePath, capsules: [] };
      }
      throw e;
    }
  }

  getCapsulesRootDir(baseDir: string): PathOsBasedAbsolute {
    return path.join(CAPSULES_BASE_DIR, hash(baseDir));
  }
}

async function createCapsulesFromComponents(
  components: Component[],
  baseDir: string,
  opts: IsolateComponentsOptions
): Promise<Capsule[]> {
  const capsules: Capsule[] = await Promise.all(
    map((component: Component) => {
      return Capsule.createFromComponent(component, baseDir, opts);
    }, components)
  );
  return capsules;
}

type CapsulePackageJsonData = {
  capsule: Capsule;
  currentPackageJson?: Record<string, any>;
  previousPackageJson: Record<string, any> | null;
};

function wereDependenciesInPackageJsonChanged(capsuleWithPackageData: CapsulePackageJsonData): boolean {
  const { previousPackageJson, currentPackageJson } = capsuleWithPackageData;
  if (!previousPackageJson) return true;
  // @ts-ignore at this point, currentPackageJson is set
  return DEPENDENCIES_FIELDS.some((field) => !equals(previousPackageJson[field], currentPackageJson[field]));
}

async function getCapsulesPreviousPackageJson(capsules: Capsule[]): Promise<CapsulePackageJsonData[]> {
  return Promise.all(
    capsules.map(async (capsule) => {
      const packageJsonPath = path.join(capsule.wrkDir, 'package.json');
      let previousPackageJson: any = null;
      try {
        const previousPackageJsonRaw = await capsule.fs.promises.readFile(packageJsonPath, { encoding: 'utf8' });
        previousPackageJson = JSON.parse(previousPackageJsonRaw);
      } catch (e) {
        // package-json doesn't exist in the capsule, that's fine, it'll be considered as a cache miss
      }
      return {
        capsule,
        previousPackageJson,
      };
    })
  );
}

function updateWithCurrentPackageJsonData(capsulesWithPackagesData: CapsulePackageJsonData[], capsules: Capsule[]) {
  capsules.forEach((capsule) => {
    const packageJson = getCurrentPackageJson(capsule);
    const found = capsulesWithPackagesData.find((c) => c.capsule.component.id.isEqual(capsule.component.id));
    if (!found) throw new Error(`updateWithCurrentPackageJsonData unable to find ${capsule.component.id}`);
    found.currentPackageJson = packageJson.packageJsonObject;
  });
}

function getCurrentPackageJson(capsule: Capsule): PackageJsonFile {
  const component: Component = capsule.component;
  const consumerComponent: ConsumerComponent = component.state._consumer;
  const newVersion = '0.0.1-new';
  const getBitDependencies = (dependencies: BitIds) => {
    return dependencies.reduce((acc, depId: BitId) => {
      const packageDependency = depId.hasVersion() ? depId.version : newVersion;
      const packageName = componentIdToPackageName({
        ...consumerComponent,
        id: depId,
        isDependency: true,
      });
      acc[packageName] = packageDependency;
      return acc;
    }, {});
  };
  const bitDependencies = getBitDependencies(consumerComponent.dependencies.getAllIds());
  const bitDevDependencies = getBitDependencies(consumerComponent.devDependencies.getAllIds());
  const bitExtensionDependencies = getBitDependencies(consumerComponent.extensions.extensionsBitIds);

  // unfortunately, component.packageJsonFile is not available here.
  // the reason is that `writeComponentsToCapsules` clones the component before writing them
  // also, don't use `PackageJsonFile.createFromComponent`, as it looses the intermediate changes
  // such as postInstall scripts for custom-module-resolution.
  const packageJson = PackageJsonFile.loadFromCapsuleSync(capsule.path);

  const addDependencies = (packageJsonFile: PackageJsonFile) => {
    packageJsonFile.addDependencies(bitDependencies);
    packageJsonFile.addDevDependencies({
      ...bitDevDependencies,
      ...bitExtensionDependencies,
    });
  };
  addDependencies(packageJson);
  packageJson.addOrUpdateProperty('version', component.id.hasVersion() ? component.id.version : newVersion);
  return packageJson;
}

IsolatorAspect.addRuntime(IsolatorMain);
