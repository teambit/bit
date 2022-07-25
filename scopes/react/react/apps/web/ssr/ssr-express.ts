import { Asset } from '@teambit/bundler';
import { Logger } from '@teambit/logger';
import { serverError } from '@teambit/ui-foundation.ui.pages.static-error';
import { browserFromExpress } from '@teambit/react.rendering.ssr';
import type { HtmlAssets } from '@teambit/react.rendering.ssr';

import Express from 'express';
import * as fs from 'fs-extra';
import { resolve } from 'path';
import urlJoin from 'url-join';

import { calcOutputPath, PUBLIC_PATH, SSR_ENTRY_FILE } from '../webpack/webpack.app.ssr.config';

const MAGIC_FOLDER = 'public'; // idk where this is comping from

type ExpressSsrOptions = {
  name: string;
  workdir: string;
  port: number;
  app: any;
  assets?: HtmlAssets;
  logger?: Logger;
};

export function createExpressSsr({ name, workdir, port, app, assets, logger }: ExpressSsrOptions) {
  const express = Express();

  const publicFolder = resolve(workdir, calcOutputPath(name, 'browser'), MAGIC_FOLDER);

  express.use(PUBLIC_PATH, Express.static(publicFolder));
  express.use((request, response, next) => {
    if (request.query.rendering !== 'client') {
      next();
      return;
    }
    response.sendFile(resolve(workdir, calcOutputPath(name, 'browser'), MAGIC_FOLDER, 'index.html'));
  });
  express.use(async (request, response) => {
    logger?.info(`[react.application] [ssr] handling "${request.url}"`);
    const browser = browserFromExpress(request, port);

    const content = await app({ assets, browser, request, response });

    try {
      response.send(content);
      logger?.info(`[react.application] [ssr] success "${request.url}"`);
    } catch (error) {
      logger?.error(`[react.application] [ssr] error at "${request.url}"`, error);
      response.status(500).send(serverError());
    }
  });

  return express;
}

export async function loadSsrApp(workdir: string, appName: string) {
  const entryFile = resolve(workdir, calcOutputPath(appName, 'ssr'), MAGIC_FOLDER, SSR_ENTRY_FILE);
  if (!fs.existsSync(entryFile)) throw new Error(`expected ssr bundle entry file at "${entryFile}"`);

  const entry = await import(entryFile);
  const app = entry?.default;
  if (!app) throw new Error(`bundle entry file has no default export (at "${entryFile}")`);

  return app;
}

export function parseAssets(assets: Asset[], publicPath = PUBLIC_PATH): HtmlAssets {
  const deadAssets = assets.filter((x) => !x.name);
  if (deadAssets.length > 0) throw new Error('missing some build assets (maybe need to turn on cachedAssets, etc)');

  return {
    css: assets
      .map((x) => x.name)
      .filter((name) => name?.endsWith('.css'))
      .map((name) => urlJoin(publicPath, name)),
    js: assets
      .map((x) => x.name)
      .filter((name) => name?.endsWith('.js'))
      .map((name) => urlJoin(publicPath, name)),
  };
}
