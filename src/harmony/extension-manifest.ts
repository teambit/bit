import { ProviderFn } from './types';

export interface ExtensionManifest<Config = {}> {
  /**
   * extension name.
   */
  name: string;

  /**
   * version of the extension
   */
  // version: string;

  /**
   * default extension config. can be of any type.
   */
  config?: Config;

  /**
   * array of extension dependencies.
   * these other extensions will be installed and resolved prior to this extension activation.
   */
  dependencies?: ExtensionManifest<any>[];

  /**
   * reference to the extension factory function.
   */
  provider: ProviderFn<Config>;

  /**
   * any further keys which might be expected by other extensions.
   */
  [key: string]: any;
}
