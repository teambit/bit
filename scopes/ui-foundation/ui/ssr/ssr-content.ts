import { BrowserData } from './request-browser';
import { Assets } from './html';

export type SsrContent = {
  assets?: Assets;
  browser?: BrowserData;
};
