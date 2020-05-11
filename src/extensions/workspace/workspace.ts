import { Harmony, ExtensionManifest } from '@teambit/harmony';
import { difference } from 'ramda';
import { compact } from 'ramda-adjunct';
import { Consumer, loadConsumer } from '../../consumer';
import { Scope } from '../scope';
import { WorkspaceConfig } from '../workspace-config';
import { Component, ComponentFactory, ComponentID } from '../component';
import ComponentsList from '../../consumer/component/components-list';
import { BitIds, BitId } from '../../bit-id';
import { Isolator } from '../isolator';
import { LogPublisher } from '../logger';
import ConsumerComponent from '../../consumer/component';
import { ResolvedComponent } from './resolved-component';
import AddComponents from '../../consumer/component-ops/add-components';
import { PathOsBasedRelative } from '../../utils/path';
import { AddActionResults } from '../../consumer/component-ops/add-components/add-components';
import { MissingBitMapComponent } from '../../consumer/bit-map/exceptions';
import { ExtensionConfigList } from '../../consumer/config/extension-config-list';
import { ComponentScopeDirMap } from '../workspace-config/workspace-settings';
import legacyLogger from '../../logger/logger';
import { UNABLE_TO_LOAD_EXTENSION, UNABLE_TO_LOAD_EXTENSION_FROM_LIST } from '../../constants';
import { DependencyResolver } from '../dependency-resolver';
/**
 * API of the Bit Workspace
 */
export default class Workspace {
  owner?: string;
  componentsScopeDirsMap: ComponentScopeDirMap;

  constructor(
    /**
     * private access to the legacy consumer instance.
     */
    public consumer: Consumer,

    /**
     * Workspace's configuration
     */
    readonly config: WorkspaceConfig,

    /**
     * access to the Workspace's `Scope` instance
     */
    readonly scope: Scope,

    /**
     * access to the `ComponentProvider` instance
     */
    private componentFactory: ComponentFactory,

    readonly isolateEnv: Isolator,

    private dependencyResolver: DependencyResolver,

    private logger: LogPublisher,

    private componentList: ComponentsList = new ComponentsList(consumer),

    /**
     * private reference to the instance of Harmony.
     */
    private harmony: Harmony
  ) {
    const workspaceExtConfig = this.config.getExtensionConfig('workspace');
    this.owner = workspaceExtConfig?.owner;
    this.componentsScopeDirsMap = workspaceExtConfig?.components || [];
  }

  /**
   * root path of the Workspace.
   */
  get path() {
    return this.consumer.getPath();
  }

  /**
   * provides status of all components in the workspace.
   */
  status() {}

  /**
   * list all workspace components.
   */
  async list() {
    const consumerComponents = await this.componentList.getAuthoredAndImportedFromFS();
    return this.transformLegacyComponents(consumerComponents);
  }

  private async transformLegacyComponents(consumerComponents: ConsumerComponent[]) {
    const transformP = consumerComponents.map(consumerComponent => {
      return this.componentFactory.fromLegacyComponent(consumerComponent);
    });
    return Promise.all(transformP);
  }

  /**
   * list all modified components in the workspace.
   */
  async modified() {
    const consumerComponents = await this.componentList.listModifiedComponents(true);
    // @ts-ignore
    return this.transformLegacyComponents(consumerComponents);
  }

  /**
   * list all new components in the workspace.
   */
  async newComponents() {
    const consumerComponents = await this.componentList.listNewComponents(true);
    // @ts-ignore
    return this.transformLegacyComponents(consumerComponents);
  }

  async loadCapsules(bitIds: string[]) {
    // throw new Error("Method not implemented.");
    const components = await this.load(bitIds);
    return components.map(comp => comp.capsule);
  }
  /**
   * fully load components, including dependency resolution and prepare them for runtime.
   * @todo: remove the string option, use only BitId
   * fully load components, inclduing dependency resuoltion and prepare them for runtime.
   */
  async load(ids: Array<BitId | string>) {
    const components = await this.getMany(ids);
    const isolatedEnvironment = await this.isolateEnv.createNetworkFromConsumer(
      components.map(c => c.id.toString()),
      this.consumer,
      {
        packageManager: 'npm'
      }
    );
    const capsulesMap = isolatedEnvironment.capsules.reduce((accum, curr) => {
      accum[curr.id.toString()] = curr.value;
      return accum;
    }, {});
    const ret = components.map(component => new ResolvedComponent(component, capsulesMap[component.id.toString()]));
    return ret;
  }

  /**
   * @todo: remove the string option, use only BitId
   * get a component from workspace
   * @param id component ID
   */
  async get(id: string | BitId | ComponentID): Promise<Component | undefined> {
    const getBitId = (): BitId => {
      if (id instanceof ComponentID) return id._legacy;
      if (typeof id === 'string') return this.consumer.getParsedId(id);
      return id;
    };
    const componentId = getBitId();
    if (!componentId) return undefined;
    const legacyComponent = await this.consumer.loadComponent(componentId);
    return this.componentFactory.fromLegacyComponent(legacyComponent);
  }

  /**
   * @todo: remove the string option, use only BitId
   */
  async getMany(ids: Array<BitId | string>) {
    const componentIds = ids.map(id => (typeof id === 'string' ? this.consumer.getParsedId(id) : id));
    const idsWithoutEmpty = compact(componentIds);
    const legacyComponents = await this.consumer.loadComponents(BitIds.fromArray(idsWithoutEmpty));
    // @ts-ignore
    return this.transformLegacyComponents(legacyComponents.components);
  }

  /**
   * track a new component. (practically, add it to .bitmap).
   *
   * @param componentPaths component paths relative to the workspace dir
   * @param id if not set, will be concluded from the filenames
   * @param main if not set, will try to guess according to some strategies and throws if failed
   * @param override whether add details to an existing component or re-define it
   */
  async add(
    componentPaths: PathOsBasedRelative[],
    id?: string,
    main?: string,
    override = false
  ): Promise<AddActionResults> {
    const addComponent = new AddComponents(
      { consumer: this.consumer },
      { componentPaths, id, main, override, allowFiles: false, allowRelativePaths: false }
    );
    const addResults = await addComponent.add();
    // @todo: the legacy commands have `consumer.onDestroy()` on command completion, it writes the
    //  .bitmap file. workspace needs a similar mechanism. once done, remove the next line.
    await this.consumer.bitMap.write();
    return addResults;
  }

  async loadWorkspaceExtensions() {
    const extensionsConfig = this.config.workspaceSettings.extensionsConfig;
    const externalExtensionsWithoutLegacy = extensionsConfig._filterLegacy();
    const externalExtensionsManifests = await this.resolveExtensions(externalExtensionsWithoutLegacy.ids);
    await this.loadExtensions([...externalExtensionsManifests]);
  }

  async loadExtensionsByConfig(extensionsConfig: ExtensionConfigList) {
    const extensionsManifests = await this.resolveExtensions(extensionsConfig.ids);
    if (extensionsManifests && extensionsManifests.length) {
      await this.loadExtensions(extensionsManifests);
    }
  }

  private async loadExtensions(extensionsManifests: ExtensionManifest[]) {
    try {
      await this.harmony.set(extensionsManifests);
    } catch (e) {
      const ids = extensionsManifests.map(manifest => manifest.name);
      const warning = UNABLE_TO_LOAD_EXTENSION_FROM_LIST(ids);
      this.logger.warn(warning);
      legacyLogger.warn(`${warning} error: ${e.message}`);
      legacyLogger.silly(e.stack);
    }
  }

  /**
   * load all of bit's extensions.
   * :TODO must be refactored by @gilad
   */
  private async resolveExtensions(extensionsIds: string[]): Promise<ExtensionManifest[]> {
    // const extensionsIds = extensionsConfig.ids;
    if (!extensionsIds || !extensionsIds.length) {
      return [];
    }

    legacyLogger.debug(`workspaceExt, resolveExtensions ${extensionsIds.join(', ')}`);
    const allRegisteredExtensionIds = this.harmony.extensionsIds;
    const nonRegisteredExtensions = difference(extensionsIds, allRegisteredExtensionIds);
    let extensionsComponents;
    // TODO: improve this, instead of catching an error, add some api in workspace to see if something from the list is missing
    try {
      extensionsComponents = await this.getMany(nonRegisteredExtensions);
    } catch (e) {
      let errorMessage = e.message;
      if (e instanceof MissingBitMapComponent) {
        errorMessage = `could not find an extension "${e.id}" or a known config with this name defined in the workspace config`;
      }

      const ids = nonRegisteredExtensions;
      const warning = UNABLE_TO_LOAD_EXTENSION_FROM_LIST(ids);
      this.logger.warn(warning);
      legacyLogger.warn(warning);
      legacyLogger.warn(`error: ${errorMessage}`);
      legacyLogger.silly(e.stack);
      throw e;
    }

    const isolatedNetwork = await this.isolateEnv.createNetworkFromConsumer(
      extensionsComponents.map(c => c.id.toString()),
      this.consumer,
      { packageManager: 'yarn' }
    );
    const manifests = isolatedNetwork.capsules.map(({ value, id }) => {
      const extPath = value.wrkDir;
      try {
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const mod = require(extPath);
        mod.name = id.toString();
        return mod;
      } catch (e) {
        const warning = UNABLE_TO_LOAD_EXTENSION(id.toString());
        this.logger.warn(warning);
        legacyLogger.warn(`${warning} error: ${e.message}`);
        legacyLogger.silly(e.stack);
      }
      return undefined;
    });

    // Remove empty manifests as a result of loading issue
    return manifests.filter(manifest => manifest);
  }

  /**
   * this should be rarely in-use.
   * it's currently used by watch extension as a quick workaround to load .bitmap and the components
   */
  async _reloadConsumer() {
    this.consumer = await loadConsumer(this.path, true);
  }
}
