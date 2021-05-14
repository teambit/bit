import R from 'ramda';
import { compact } from 'lodash';
import { join } from 'path';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import ComponentAspect, { Component, ComponentMain, Snap } from '@teambit/component';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { IsolatorAspect, IsolatorMain } from '@teambit/isolator';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { PackageJsonTransformer } from '@teambit/legacy/dist/consumer/component/package-json-transformer';
import LegacyComponent from '@teambit/legacy/dist/consumer/component';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';
import { BuilderMain, BuilderAspect, BuildTaskHelper } from '@teambit/builder';
import { BitError } from '@teambit/bit-error';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { GraphqlMain, GraphqlAspect } from '@teambit/graphql';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';

import { Packer, PackOptions, PackResult, TAR_FILE_ARTIFACT_NAME } from './packer';
// import { BitCli as CLI, BitCliExt as CLIExtension } from '@teambit/cli';
import { PackCmd } from './pack.cmd';
import { PkgAspect } from './pkg.aspect';
import { PreparePackagesTask } from './prepare-packages.task';
import { PublishDryRunTask } from './publish-dry-run.task';
import { PublishCmd } from './publish.cmd';
import { Publisher } from './publisher';
import { PublishTask } from './publish.task';
import { PackageTarFiletNotFound, PkgArtifactNotFound } from './exceptions';
import { PkgArtifact } from './pkg-artifact';
import { PackageRoute, routePath } from './package.route';
import { PackageDependencyFactory } from './package-dependency';
import { pkgSchema } from './pkg.graphql';
import { PackageFragment } from './package.fragment';

export interface PackageJsonProps {
  [key: string]: any;
}

export type PackageJsonPropsRegistry = SlotRegistry<PackageJsonProps>;

export type PkgExtensionConfig = {};

/**
 * Config for variants
 */
export type ComponentPkgExtensionConfig = {
  /**
   * properties to add to the package.json of the component.
   */
  packageJson: Record<string, any>;
};

/**
 * Data stored in the component
 */
export type ComponentPkgExtensionData = {
  /**
   * properties to add to the package.json of the component.
   */
  packageJsonModification: Record<string, any>;

  /**
   * Final package.json after creating tar file
   */
  pkgJson?: Record<string, any>;

  /**
   * Checksum of the tar file
   */
  checksum?: string;
};

type ComponentPackageManifest = {
  name: string;
  distTags: Record<string, string>;
  externalRegistry: boolean;
  versions: VersionPackageManifest[];
};

type VersionPackageManifest = {
  [key: string]: any;
  dist: {
    tarball: string;
    shasum: string;
  };
};

export class PkgMain {
  static runtime = MainRuntime;
  static dependencies = [
    CLIAspect,
    ScopeAspect,
    EnvsAspect,
    IsolatorAspect,
    LoggerAspect,
    WorkspaceAspect,
    BuilderAspect,
    DependencyResolverAspect,
    ComponentAspect,
    GraphqlAspect,
  ];
  static slots = [Slot.withType<PackageJsonProps>()];
  static defaultConfig = {};

  static async provider(
    [cli, scope, envs, isolator, logger, workspace, builder, dependencyResolver, componentAspect, graphql]: [
      CLIMain,
      ScopeMain,
      EnvsMain,
      IsolatorMain,
      LoggerMain,
      Workspace,
      BuilderMain,
      DependencyResolverMain,
      ComponentMain,
      GraphqlMain
    ],
    config: PkgExtensionConfig,
    [packageJsonPropsRegistry]: [PackageJsonPropsRegistry]
  ) {
    const logPublisher = logger.createLogger(PkgAspect.id);
    const host = componentAspect.getHost();
    const packer = new Packer(isolator, logPublisher, host, scope);
    const publisher = new Publisher(isolator, logPublisher, scope?.legacyScope, workspace);
    const pkg = new PkgMain(config, packageJsonPropsRegistry, workspace, scope, builder, packer, envs, componentAspect);

    componentAspect.registerShowFragments([new PackageFragment(pkg)]);
    dependencyResolver.registerDependencyFactories([new PackageDependencyFactory()]);

    graphql.register(pkgSchema(pkg));

    componentAspect.registerRoute([new PackageRoute(pkg)]);

    const dryRunTask = new PublishDryRunTask(PkgAspect.id, publisher, packer, logPublisher);
    const preparePackagesTask = new PreparePackagesTask(PkgAspect.id, logPublisher);
    const publishTask = new PublishTask(PkgAspect.id, publisher, packer, logPublisher);
    dryRunTask.dependencies = [BuildTaskHelper.serializeId(preparePackagesTask)];
    builder.registerBuildTasks([preparePackagesTask, dryRunTask]);
    builder.registerDeployTasks([publishTask]);
    if (workspace) {
      // workspace.onComponentLoad(pkg.mergePackageJsonProps.bind(pkg));
      workspace.onComponentLoad(async (component) => {
        const data = await pkg.mergePackageJsonProps(component);
        return {
          packageJsonModification: data,
        };
      });
    }

    PackageJsonTransformer.registerPackageJsonTransformer(pkg.transformPackageJson.bind(pkg));
    // TODO: consider passing the pkg instead of packer
    cli.register(new PackCmd(packer), new PublishCmd(publisher));
    return pkg;
  }

  /**
   * get the package name of a component.
   */
  getPackageName(component: Component) {
    return componentIdToPackageName(component.state._consumer);
  }

  /**
   * returns the package path in the /node_modules/ folder
   */
  getModulePath(component: Component) {
    const pkgName = this.getPackageName(component);
    const path = join('node_modules', pkgName);
    return path;
  }

  /**
   *Creates an instance of PkgExtension.
   * @param {PkgExtensionConfig} config
   * @param {PackageJsonPropsRegistry} packageJsonPropsRegistry
   * @param {Packer} packer
   * @memberof PkgExtension
   */
  constructor(
    /**
     * pkg extension configuration.
     */
    readonly config: PkgExtensionConfig,

    /**
     * Registry for changes by other extensions.
     */
    private packageJsonPropsRegistry: PackageJsonPropsRegistry,

    private workspace: Workspace,
    private scope: ScopeMain,

    private builder: BuilderMain,
    /**
     * A utils class to packing components into tarball
     */
    private packer: Packer,

    /**
     * envs extension.
     */
    private envs: EnvsMain,

    private componentAspect: ComponentMain
  ) {}

  /**
   * register changes in the package.json
   */
  registerPackageJsonNewProps(props: PackageJsonProps): void {
    return this.packageJsonPropsRegistry.register(props);
  }

  /**
   * Pack a component and generate a tarball suitable for npm registry
   *
   * @param {string} componentId
   * @param {(string | undefined)} scopePath
   * @param {string} outDir
   * @param {boolean} [prefix=false]
   * @param {boolean} [override=false]
   * @param {boolean} [keep=false]
   * @returns {Promise<PackResult>}
   * @memberof PkgExtension
   */
  async packComponent(componentId: string, scopePath: string | undefined, options: PackOptions): Promise<PackResult> {
    return this.packer.packComponent(componentId, scopePath, options);
  }

  /**
   * Merge the configs provided by:
   * 1. envs configured in the component - via getPackageJsonProps method
   * 2. extensions that registered to the registerPackageJsonNewProps slot (and configured for the component)
   * 3. props defined by the user (they are the strongest one)
   */
  async mergePackageJsonProps(component: Component): Promise<PackageJsonProps> {
    let newProps = {};
    const env = this.envs.calculateEnv(component)?.env;
    if (env?.getPackageJsonProps && typeof env.getPackageJsonProps === 'function') {
      const propsFromEnv = env.getPackageJsonProps();
      newProps = Object.assign(newProps, propsFromEnv);
    }

    const configuredIds = component.state.aspects.ids;
    configuredIds.forEach((extId) => {
      // Only get props from configured extensions on this specific component
      const props = this.packageJsonPropsRegistry.get(extId);
      if (props) {
        newProps = Object.assign(newProps, props);
      }
    });

    const currentExtension = component.state.aspects.get(PkgAspect.id);
    const currentConfig = (currentExtension?.config as unknown) as ComponentPkgExtensionConfig;
    if (currentConfig && currentConfig.packageJson) {
      newProps = Object.assign(newProps, currentConfig.packageJson);
    }
    // Keys not allowed to override
    const specialKeys = ['extensions', 'dependencies', 'devDependencies', 'peerDependencies'];
    return R.omit(specialKeys, newProps);
  }

  getPackageJsonModifications(component: Component): Record<string, any> {
    const currentExtension = component.state.aspects.get(PkgAspect.id);
    const currentData = (currentExtension?.data as unknown) as ComponentPkgExtensionData;
    return currentData?.packageJsonModification ?? {};
  }

  async getPkgArtifact(component: Component): Promise<PkgArtifact> {
    const artifacts = await this.builder.getArtifactsVinylByExtension(component, PkgAspect.id);
    if (!artifacts.length) throw new PkgArtifactNotFound(component.id);

    return new PkgArtifact(artifacts);
  }

  async getManifest(component: Component): Promise<ComponentPackageManifest> {
    const name = this.getPackageName(component);
    const latestVersion = component.latest;
    if (!latestVersion) {
      throw new BitError('can not get manifest for component without versions');
    }
    const distTags = {
      latest: latestVersion,
    };

    const versions = await this.getAllSnapsManifests(component);
    const versionsWithoutEmpty: VersionPackageManifest[] = compact(versions);
    const externalRegistry = this.isPublishedToExternalRegistry(component);
    return {
      name,
      distTags,
      externalRegistry,
      versions: versionsWithoutEmpty,
    };
  }

  private async getAllSnapsManifests(component: Component): Promise<VersionPackageManifest[]> {
    const iterable = component.snapsIterable();
    const result: VersionPackageManifest[] = [];
    for await (const snap of iterable) {
      const manifest = await this.getSnapManifest(component, snap);
      if (manifest) {
        result.push(manifest);
      }
    }
    return result;
  }

  /**
   * Check if the component should be fetched from bit registry or from another registry
   * This will usually determined by the latest version of the component
   * @param component
   */
  isPublishedToExternalRegistry(component: Component): boolean {
    const pkgExt = component.state.aspects.get(PkgAspect.id);
    // By default publish to bit registry
    if (!pkgExt) return false;
    return !!(pkgExt.config?.packageJson?.name || pkgExt.config?.packageJson?.publishConfig);
  }

  private getComponentBuildData(component: Component): ComponentPkgExtensionData | undefined {
    const data = this.builder.getDataByAspect(component, PkgAspect.id);
    if (data) return data as ComponentPkgExtensionData;
    // backward compatibility. the data used to be saved on the pkg aspect rather than on the
    // builder aspect
    const currentExtension = component.state.aspects.get(PkgAspect.id);
    return currentExtension?.data as ComponentPkgExtensionData | undefined;
  }

  async getSnapManifest(component: Component, snap: Snap): Promise<VersionPackageManifest | undefined> {
    const idWithCorrectVersion = component.id.changeVersion(snap.hash);
    // const state = await this.scope.getState(component.id, tag.hash);
    // const currentExtension = state.aspects.get(PkgAspect.id);
    const updatedComponent = await this.componentAspect.getHost().get(idWithCorrectVersion, true);
    if (!updatedComponent) {
      throw new BitError(`snap ${snap.hash} for component ${component.id.toString()} is missing`);
    }
    const currentData = this.getComponentBuildData(updatedComponent);
    // If for some reason the version has no package.json manifest, return undefined
    if (!currentData?.pkgJson) {
      return undefined;
    }
    const pkgJson = currentData?.pkgJson ?? {};
    const checksum = currentData?.checksum;
    if (!checksum) {
      throw new BitError(`checksum for ${component.id} is missing`);
    }
    const dist = {
      shasum: checksum,
      tarball: this.componentAspect.getRoute(idWithCorrectVersion, routePath),
    };

    const manifest = {
      ...pkgJson,
      dist,
    };
    return manifest;
  }

  async getPackageTarFile(component: Component): Promise<AbstractVinyl> {
    const artifacts = await this.builder.getArtifactsVinylByExtensionAndName(
      component,
      PkgAspect.id,
      TAR_FILE_ARTIFACT_NAME
    );
    if (!artifacts.length) throw new PackageTarFiletNotFound(component.id);

    return artifacts[0];
  }

  async transformPackageJson(
    legacyComponent: LegacyComponent,
    packageJsonObject: Record<string, any>
  ): Promise<Record<string, any>> {
    // const newId = await this.workspace.resolveComponentId(component.id);
    // const newComponent = await this.workspace.get(newId);
    const host = this.componentAspect.getHost();
    const id = await host.resolveComponentId(legacyComponent.id);
    const newComponent = await host.get(id);
    if (!newComponent) throw new Error(`cannot transform package.json of component: ${legacyComponent.id.toString()}`);
    const newProps = this.getPackageJsonModifications(newComponent);
    return Object.assign(packageJsonObject, newProps);
  }
}

PkgAspect.addRuntime(PkgMain);
