import type { Assets } from '@teambit/ui-foundation.ui.rendering.html';
import { Request, Response, NextFunction } from 'express';
import path from 'path';
import * as fs from 'fs-extra';
import type { Logger } from '@teambit/logger';
import { requestToObj } from './request-browser';
import { SsrContent } from './ssr-content';

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
    } catch (e: any) {
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
      logger.warn('[ssr] - Skipping setup (cannot find asset manifest file)');
      return undefined;
    }

    assets = await parseManifest(manifestFilepath);
    if (!assets) {
      logger.warn('[ssr] - Skipping setup (failed parsing assets manifest)');
      return undefined;
    }

    const imported = await import(entryFilepath);
    render = imported?.render;

    if (!render || typeof render !== 'function') {
      logger.warn('[ssr] - index file does not export a render() function. Skipping setup.');
      return undefined;
    }
  } catch (e: any) {
    logger.error(e);
    return undefined;
  }

  return {
    render,
    assets,
  };
}

async function parseManifest(filepath: string, logger?: Logger) {
  try {
    const file = await fs.readFile(filepath);
    logger?.debug('[ssr] - ✓ aread manifest file');
    const contents = file.toString();
    const parsed: ManifestFile = JSON.parse(contents);
    logger?.debug('[ssr] - ✓ prased manifest file', parsed);
    const assets = getAssets(parsed);
    logger?.debug('[ssr] - ✓ extracted data from manifest file', assets);

    return assets;
  } catch (e: any) {
    logger?.error('[ssr] - error parsing asset manifest', e);
    process.exit();
    return undefined;
  }
}

function getAssets(manifest: ManifestFile) {
  const assets: Assets = { css: [], js: [] };

  assets.css = manifest.entrypoints?.filter((x) => x.endsWith('css')).map((x) => path.join('/', x));
  assets.js = manifest.entrypoints?.filter((x) => x.endsWith('js')).map((x) => path.join('/', x));

  return assets;
}
