import { ProxyEntry } from './ui-root';

export type StartPluginOptions = {
  /**
   * indicates whether the start in on verbose mode.
   */
  verbose?: boolean;

  /**
   * component pattern it applies on.
   */
  pattern?: string;

  /**
   * Show the internal urls of the dev servers
   */
  showInternalUrls?: boolean;
};

export interface StartPlugin {
  initiate(startOptions: StartPluginOptions): void;

  getProxy?(): ProxyEntry[];

  /** promise that resolves when the plugin completed initiation */
  readonly whenReady: Promise<void>;
}
