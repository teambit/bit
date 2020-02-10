import { ProviderFn } from './types';

export interface ExtensionManifest<Config = {}> {
  /**
   * extension name.
   */
  name: string;

  /**
   * default extension config. can be of any type.
   */
  config?: Config;

  /**
   * register actions the component handles.
   */
  actions?: { [action: string]: (component: any) => void };

  /**
   * array of extension dependencies.
   * these other extensions will be installed and resolved prior to this extension activation.
   */
  dependencies?: ExtensionManifest<any>[];

  /**
   * reference to the extension factory function.
   */
  provider: ProviderFn<Config>;
}
