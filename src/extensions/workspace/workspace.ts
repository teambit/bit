import { difference } from 'ramda';
import { Consumer } from '../../consumer';
import { Scope } from '../scope';
import { Harmony } from '../../harmony';
import { WorkspaceConfig } from '../workspace-config';
import { Component, ComponentFactory } from '../component';
import ComponentsList from '../../consumer/component/components-list';
import { ComponentHost } from '../../shared-types';
import { BitIds, BitId } from '../../bit-id';
import { Network } from '../network';
import ConsumerComponent from '../../consumer/component';
import { ResolvedComponent } from './resolved-component';
import AddComponents from '../../consumer/component-ops/add-components';
import { PathOsBasedRelative } from '../../utils/path';
import { AddActionResults } from '../../consumer/component-ops/add-components/add-components';
import { AnyExtension } from '../../harmony';
import { MissingBitMapComponent } from '../../consumer/bit-map/exceptions';
import GeneralError from '../../error/general-error';
import { ExtensionConfigList } from '../workspace-config/extension-config-list';

/**
 * API of the Bit Workspace
 */
export default class Workspace implements ComponentHost {
  constructor(
    /**
     * private access to the legacy consumer instance.
     */
    readonly consumer: Consumer,

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

    readonly network: Network,

    private componentList: ComponentsList = new ComponentsList(consumer),

    /**
     * private reference to the instance of Harmony.
     */
    private harmony: Harmony<unknown>
  ) {}

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
    this.componentFactory.registerAddConfig('worksapce', () => {
      return {
        conf: 'val'
      };
    });

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

  /**
   * fully load components, including dependency resolution and prepare them for runtime.
   * @todo: remove the string option, use only BitId
   * fully load components, inclduing dependency resuoltion and prepare them for runtime.
   */
  async load(ids: Array<BitId | string>) {
    const components = await this.getMany(ids);
    const subNetwork = await this.network.createSubNetwork(
      components.map(c => c.id.toString()),
      { workspace: this.path }
    );
    const capsulesMap = subNetwork.capsules.reduce((accum, curr) => {
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
  async get(id: string | BitId): Promise<Component | undefined> {
    const componentId = typeof id === 'string' ? this.consumer.getParsedId(id) : id;
    const legacyComponent = await this.consumer.loadComponent(componentId);
    return this.componentFactory.fromLegacyComponent(legacyComponent);
  }

  /**
   * @todo: remove the string option, use only BitId
   */
  async getMany(ids: Array<BitId | string>) {
    const componentIds = ids.map(id => (typeof id === 'string' ? this.consumer.getParsedId(id) : id));
    const legacyComponents = await this.consumer.loadComponents(BitIds.fromArray(componentIds));
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
    const addComponent = new AddComponents({ consumer: this.consumer }, { componentPaths, id, main, override });
    const addResults = await addComponent.add();
    // @todo: the legacy commands have `consumer.onDestroy()` on command completion, it writes the
    //  .bitmap file. workspace needs a similar mechanism. once done, remove the next line.
    await this.consumer.bitMap.write();
    return addResults;
  }

  async loadWorkspaceExtensions() {
    const extensionsConfig = this.config.workspaceSettings.extensionsConfig;
    const extensionsManifests = await this.resolveExtensions(extensionsConfig);
    await this.loadExtensions(extensionsManifests, extensionsConfig);
  }

  async loadExtensionsByConfig(extensionsConfig: ExtensionConfigList) {
    const extensionsManifests = await this.resolveExtensions(extensionsConfig);
    await this.loadExtensions(extensionsManifests, extensionsConfig);
  }

  private async loadExtensions(extensionsManifests: AnyExtension[], extensionsConfig: ExtensionConfigList) {
    await this.harmony.set(extensionsManifests, extensionsConfig.toObject());
  }

  /**
   * load all of bit's extensions.
   * :TODO must be refactored by @gilad
   */
  private async resolveExtensions(extensionsConfig: ExtensionConfigList): Promise<AnyExtension[]> {
    const extensionsIds = extensionsConfig.ids;

    if (!extensionsIds || !extensionsIds.length) {
      return [];
    }
    const allRegisteredExtensionIds = this.harmony.extensionsIds;
    const nonRegisteredExtensions = difference(extensionsIds, allRegisteredExtensionIds);
    let extensionsComponents;
    // TODO: improve this, instead of catching an error, add some api in workspace to see if something from the list is missing
    try {
      extensionsComponents = await this.getMany(nonRegisteredExtensions);
    } catch (e) {
      if (e instanceof MissingBitMapComponent) {
        throw new GeneralError(
          `could not find an extension "${e.id}" or a known config with this name defined in the workspace config`
        );
      }
    }

    const subNetwork = await this.network.createSubNetwork(
      extensionsComponents.map(c => c.id.toString()),
      { packageManager: 'yarn' }
    );
    const manifests = subNetwork.capsules.map(({ value, id }) => {
      const extPath = value.wrkDir;
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const mod = require(extPath);
      mod.name = id.toString();
      return mod;
    });
    return manifests;
  }
}
