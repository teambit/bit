import { Request, Response, NextFunction } from 'express';
import path from 'path';
import * as fs from 'fs-extra';
import type { Logger } from '@teambit/logger';
import { requestToObj } from './request-browser';
import { SsrContent } from './ssr-content';
import type { Assets } from './html';

const denyList = /^\/favicon.ico$/;

type ssrRenderProps = {
  root: string;
  port: number;
  title: string;
  logger: Logger;
};

type ManifestFile = {
  files?: Record<string, string>;
  entrypoints?: string[];
};

export async function createSsrMiddleware({ root, port, title, logger }: ssrRenderProps) {
  const runtime = await loadRuntime(root, { logger });
  if (!runtime) return undefined;

  const { render } = runtime;
  const assets = { ...runtime.assets, title };

  return async function serverRenderMiddleware(req: Request, res: Response, next: NextFunction) {
    const { query, url } = req;

    const browser = requestToObj(req, port);

    if (denyList.test(url)) {
      logger.debug(`[ssr] skipping static denyList file ${url}`);
      next();
      return;
    }

    if (query.rendering === 'client') {
      logger.debug(`[ssr] skipping ${url}`);
      next();
      return;
    }

    logger.debug(`[ssr] ${req.method} ${url}`);
    const server = { port, request: req, response: res };
    const props: SsrContent = { assets, browser, server };

    try {
      const rendered = await render(props);
      res.set('Cache-Control', 'no-cache');
      res.send(rendered);
      logger.debug(`[ssr] success '${url}'`);
    } catch (e) {
      logger.error(`[ssr] failed at '${url}'`, e);
      next();
    }
  };
}

async function loadRuntime(root: string, { logger }: { logger: Logger }) {
  let render: (...arg: any[]) => any;
  let assets: Assets | undefined;

  try {
    const entryFilepath = path.join(root, 'ssr', 'index.js');
    if (!fs.existsSync(entryFilepath)) {
      logger.warn(`[ssr] - Skipping setup - failed finding ssr bundle at "${entryFilepath}"`);
      return undefined;
    }

    const manifestFilepath = path.join(root, 'asset-manifest.json');
    if (!fs.existsSync(manifestFilepath)) {
      logger.warn('[ssr] - Failed finding asset manifest file. Skipping setup.');
      return undefined;
    }

    assets = await parseManifest(manifestFilepath);
    if (!assets) {
      logger.warn('[ssr] - failed parsing assets manifest. Skipping setup.');
      return undefined;
    }

    const imported = await import(entryFilepath);
    render = imported?.render;

    if (!render || typeof render !== 'function') {
      logger.warn('[ssr] - index file does not export a render() function. Skipping setup.');
      return undefined;
    }
  } catch (e) {
    logger.error(e);
    return undefined;
  }

  return {
    render,
    assets,
  };
}

async function parseManifest(filepath: string) {
  try {
    const file = await fs.readFile(filepath);
    const contents = file.toString();
    const parsed: ManifestFile = JSON.parse(contents);
    const assets = getAssets(parsed);

    return assets;
  } catch (e) {
    return undefined;
  }
}

function getAssets(manifest: ManifestFile) {
  const assets: Assets = { css: [], js: [] };

  assets.css = manifest.entrypoints?.filter((x) => x.endsWith('css')).map((x) => path.join('/', x));
  assets.js = manifest.entrypoints?.filter((x) => x.endsWith('js')).map((x) => path.join('/', x));

  return assets;
}
