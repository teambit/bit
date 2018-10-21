/** @flow */
import ExtensionWrapper from './extension-wrapper';
import loadExtensions from './extensions-loader';

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
}

const extensionRegistry = new ExtensionRegistry();
export default extensionRegistry;
