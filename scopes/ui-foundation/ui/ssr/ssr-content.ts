import { BrowserData } from './request-browser';
import { RequestServer } from './request-server';
import { Assets } from './html';

export type SsrContent = {
  assets?: Assets;
  browser?: BrowserData;
  server?: RequestServer;
};
