import R from 'ramda';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import ComponentAspect, { Component, ComponentMain } from '@teambit/component';
import { EnvsAspect, EnvsMain } from '@teambit/environments';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { IsolatorAspect, IsolatorMain } from '@teambit/isolator';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { PackageJsonTransformer } from 'bit-bin/dist/consumer/component/package-json-transformer';
import LegacyComponent from 'bit-bin/dist/consumer/component';
import componentIdToPackageName from 'bit-bin/dist/utils/bit/component-id-to-package-name';
import { BuilderMain, BuilderAspect } from '@teambit/builder';
import { Packer, PackOptions, PackResult } from './packer';
// import { BitCli as CLI, BitCliExt as CLIExtension } from '@teambit/cli';
import { PackCmd } from './pack.cmd';
import { PkgAspect } from './pkg.aspect';
import { PreparePackagesTask } from './prepare-packages.task';
import { PublishDryRunTask } from './publish-dry-run.task';
import { PublishCmd } from './publish.cmd';
import { Publisher } from './publisher';
import { PublishTask } from './publish.task';

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
  packageJson: Record<string, any>;
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
    ComponentAspect,
  ];
  static slots = [Slot.withType<PackageJsonProps>()];
  static defaultConfig = {};

  static async provider(
    [cli, scope, envs, isolator, logger, workspace, builder, componentAspect]: [
      CLIMain,
      ScopeMain,
      EnvsMain,
      IsolatorMain,
      LoggerMain,
      Workspace,
      BuilderMain,
      ComponentMain
    ],
    config: PkgExtensionConfig,
    [packageJsonPropsRegistry]: [PackageJsonPropsRegistry]
  ) {
    const logPublisher = logger.createLogger(PkgAspect.id);
    const host = await componentAspect.getHost();
    const packer = new Packer(isolator, logPublisher, host, scope);
    const publisher = new Publisher(isolator, logPublisher, scope?.legacyScope, workspace);
    const dryRunTask = new PublishDryRunTask(PkgAspect.id, publisher, packer, logPublisher);
    const preparePackagesTask = new PreparePackagesTask(PkgAspect.id, logPublisher);
    const pkg = new PkgMain(
      config,
      packageJsonPropsRegistry,
      workspace,
      packer,
      envs,
      dryRunTask,
      preparePackagesTask,
      componentAspect
    );

    builder.registerDeployTask(new PublishTask(PkgAspect.id, publisher, packer, logPublisher));
    if (workspace) {
      // workspace.onComponentLoad(pkg.mergePackageJsonProps.bind(pkg));
      workspace.onComponentLoad(async (component) => {
        const data = await pkg.mergePackageJsonProps(component);
        return {
          packageJson: data,
        };
      });
    }

    PackageJsonTransformer.registerPackageJsonTransformer(pkg.transformPackageJson.bind(pkg));
    // TODO: consider passing the pkg instead of packer
    cli.register(new PackCmd(packer));
    cli.register(new PublishCmd(publisher));

    return pkg;
  }

  /**
   * get the package name of a component.
   */
  getPackageName(component: Component) {
    return componentIdToPackageName(component.state._consumer);
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
    /**
     * A utils class to packing components into tarball
     */
    private packer: Packer,

    /**
     * envs extension.
     */
    private envs: EnvsMain,

    readonly dryRunTask: PublishDryRunTask,

    readonly preparePackagesTask: PreparePackagesTask,

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
    const env = this.envs.getEnv(component)?.env;
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
    return currentData?.packageJson ?? {};
  }

  async transformPackageJson(
    legacyComponent: LegacyComponent,
    packageJsonObject: Record<string, any>
  ): Promise<Record<string, any>> {
    // const newId = await this.workspace.resolveComponentId(component.id);
    // const newComponent = await this.workspace.get(newId);
    const host = await this.componentAspect.getHost();
    const id = await host.resolveComponentId(legacyComponent.id);
    const newComponent = await host.get(id);
    if (!newComponent) throw new Error(`cannot transform package.json of component: ${legacyComponent.id.toString()}`);
    const newProps = this.getPackageJsonModifications(newComponent);
    return Object.assign(packageJsonObject, newProps);
  }
}

PkgAspect.addRuntime(PkgMain);
