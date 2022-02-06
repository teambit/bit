import type { Assets } from '@teambit/ui-foundation.ui.rendering.html';
import { BrowserData } from './request-browser';
import { RequestServer } from './request-server';

export type SsrContent = {
  assets?: Assets;
  browser?: BrowserData;
  server?: RequestServer;
};
