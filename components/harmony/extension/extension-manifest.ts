import { ProviderFn } from '../types';
import { SlotProvider } from '../slots';

export type ExtensionManifest = {
  /**
   * extension name.
   */
  name: string;

  /**
   * extension unique ID.
   */
  id?: string;

  /**
   * version of the extension
   */
  // version: string;

  /**
   * array of extension dependencies.
   * these other extensions will be installed and resolved prior to this extension activation.
   */
  dependencies?: ExtensionManifest[];

  /**
   * reference to the extension factory function.
   */
  provider?: ProviderFn;

  /**
   *
   * default config of the extension.
   */
  defaultConfig?: object;

  /**
   * alias to provider.
   */
  provide?: ProviderFn;

  /**
   * array of slots the extension is exposing.
   */
  slots?: SlotProvider<unknown>[];

  /**
   * any further keys which might be expected by other extensions.
   */
  [key: string]: any;
};
