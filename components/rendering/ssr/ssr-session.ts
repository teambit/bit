import type { Assets } from '@teambit/ui-foundation.ui.rendering.html';
import type { Request, Response } from 'express';
import { BrowserData } from './request-browser';

export type SsrSession = {
  assets: Assets;
  browser: BrowserData;

  // express tools:
  request: Request;
  response: Response;
};
