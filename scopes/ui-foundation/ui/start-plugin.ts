import { ComponentType } from 'react';
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
};

export interface StartPlugin {
  initiate(startOptions: StartPluginOptions): void;

  getProxy?(): ProxyEntry[];

  render(): ComponentType;
}
