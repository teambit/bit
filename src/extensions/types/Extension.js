// @flow

import Component from './component';
import type { ComponentId } from './Component';

type ExtensionProps = {
  component: Component,
  resolvedConfig: Object // config after traversing and load each of the types of the configs
};

type ExtensionLoadProps = {
  componentId: ComponentId,
  config: Object
};

export default class Extension extends Component {
  constructor(extensionProps: ExtensionProps) {
    super(extensionProps.componentId);
    this._name = 'extension';
    this.config = extensionProps.resolvedConfig;
    this.component = extensionProps.component;
  }

  static loadFromJson(extensionLoadProps: ExtensionLoadProps) {
    const resolvedConfig = _resolveConfigRecursively(extensionLoadProps.config);
    return new Extension({ componentId: extensionLoadProps.componentId, resolvedConfig });
  }

  // Called when writing the component bit.json to FS
  eject() {
    // return this.val;
  }

  getStore() {
    const serialized = super.serialize();
    serialized.config = _serializeConfigRecursively(this.config);
    return serialized;
  }

  loadFromStore(modelVal) {
    const deserialized = super.deserialize(modelVal);
    deserialized.config = _deserializeConfigRecursively(modelVal.config);
    return deserialized;
  }

  static validate() {
    // Validate component id is valid
    // go over the config and validate against the prop types
  }

  async writeConfigFilesToFs({
    dir,
    deleteOldFiles,
    verbose = false
  }: {
    dir: string,
    deleteOldFiles: boolean,
    verbose: boolean
  }): Promise<string> {}

  /**
   * Delete env files from file system
   */
  async removeConfigFilesFromFs(
    dependencies: Dependencies,
    configDir: ConfigDir,
    envType: EnvType,
    consumerPath: PathOsBased
  ): Promise<boolean> {}
}
