/** @flow */
import ExtensionWrapper from './extension-wrapper';
import loadExtensions from './extensions-loader';
import { COMPONENT_ORIGINS } from '../constants';
import logger from '../logger/logger';

// {componentId: array of extensions}
type ComponentExtensions = {
  [string]: ExtensionWrapper[]
};

type ExtensionRegistryProps = {
  workspaceExtensions: ExtensionWrapper[],
  componentExtensions: ComponentExtensions
};

/**
 * A class to store in memory all the loaded extension
 */
class ExtensionRegistry {
  workspaceExtensions: ExtensionWrapper[];
  componentExtensions: ComponentExtensions;

  async init() {
    const extensions = await loadExtensions();
    this.workspaceExtensions = extensions;
    this.componentExtensions = {};
  }

  async store() {
    const storeData = {};
    const promises = this.workspaceExtensions.map(async (extension) => {
      return extension.config.storeProps().then((val) => {
        storeData[extension.name] = val;
      });
    });
    await Promise.all(promises);
    return storeData;
  }

  /**
   * Load component's extensions from the correct place
   * This take into account the component origin (authored / imported)
   * And the detach status of the extension
   * If a component has a bit.json with an extension defined take it
   * Else if a component is not authored take if from the models
   * Else, for authored component check if the extension has been changed
   *
   */
  async getComponentExtensions({
    componentId,
    consumerPath,
    scopePath,
    componentOrigin,
    componentFromModel,
    consumerBitJson,
    componentBitJson,
    detached,
    envType,
    context
  }: {
    componentId: string,
    consumerPath: string,
    scopePath: string,
    componentOrigin: ComponentOrigin,
    componentFromModel: ConsumerComponent,
    consumerBitJson: ConsumerBitJson,
    componentBitJson: ?ComponentBitJson,
    detached: ?boolean,
    envType: EnvType,
    context?: Object
  }): Promise<?(ExtensionWrapper[])> {
    const stringId = componentId.toStringWithoutVersion();
    logger.debugAndAddBreadCrumb('extension-registry', `getComponentExtensions for ${stringId}`);
    if (this.componentExtensions[stringId]) {
      logger.debugAndAddBreadCrumb('extension-registry', `getComponentExtensions for ${stringId} - found in cache`);
      return this.componentExtensions[stringId];
    }
    // Authored component
    if (componentOrigin === COMPONENT_ORIGINS.AUTHORED) {
      // TODO: Handle more loading opts (like from models when detached etc)
      return this.workspaceExtensions;
    }
  }
}

const extensionRegistry = new ExtensionRegistry();
export default extensionRegistry;
