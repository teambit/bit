import { browserFromExpress } from '@teambit/react.rendering.ssr';
import type { HtmlAssets, SsrSession } from '@teambit/react.rendering.ssr';
import type { Logger } from '@teambit/logger';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import * as fs from 'fs-extra';

const denyList = /^\/favicon.ico$/;

type ssrRenderProps = {
  root: string;
  port: number;
  title: string;
  /** entry of the ui bundle whose assets this root serves */
  entryName: string;
  logger: Logger;
};

type ManifestFile = {
  files?: Record<string, string>;
  /** assets of the `main` entry; empty for a multi-entry bundle - see `entrypointsByName` */
  entrypoints?: string[];
  entrypointsByName?: Record<string, string[]>;
};

export async function createSsrMiddleware({ root, port, title, entryName, logger }: ssrRenderProps) {
  const runtime = await loadRuntime(root, { entryName, logger });
  if (!runtime) return undefined;

  const { render } = runtime;
  const assets = { ...runtime.assets, title };

  return async function serverRenderMiddleware(request: Request, response: Response, next: NextFunction) {
    const { query, url } = request;

    const browser = browserFromExpress(request, port);

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

    logger.debug(`[ssr] ${request.method} ${url}`);
    const props: SsrSession = { assets, browser, request, response };

    try {
      const rendered = await render(props);
      response.set('Cache-Control', 'no-cache');
      response.send(rendered);
      logger.debug(`[ssr] success '${url}'`);
    } catch (e: any) {
      logger.error(`[ssr] failed at '${url}'`, e);
      next();
    }
  };
}

async function loadRuntime(root: string, { entryName, logger }: { entryName: string; logger: Logger }) {
  let render: (...arg: any[]) => any;
  let assets: HtmlAssets | undefined;

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

    assets = await parseManifest(manifestFilepath, entryName);
    if (!assets) {
      logger.warn('[ssr] - Skipping setup (failed parsing assets manifest)');
      return undefined;
    }

    const imported = await import(entryFilepath);
    render = imported?.default || imported?.render;

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

async function parseManifest(filepath: string, entryName: string, logger?: Logger) {
  try {
    const file = await fs.readFile(filepath);
    logger?.debug('[ssr] - ✓ aread manifest file');
    const contents = file.toString();
    const parsed: ManifestFile = JSON.parse(contents);
    logger?.debug('[ssr] - ✓ prased manifest file', parsed);
    const assets = getAssets(parsed, entryName);
    logger?.debug('[ssr] - ✓ extracted data from manifest file', assets);

    return assets;
  } catch (e: any) {
    logger?.error('[ssr] - error parsing asset manifest', e);
    process.exit();
    return undefined;
  }
}

function getAssets(manifest: ManifestFile, entryName: string) {
  const assets: HtmlAssets = { css: [], js: [] };
  // a multi-entry bundle has no single `entrypoints` list - take this root's entry, and fall back
  // to `entrypoints` for a single-entry manifest.
  const entrypoints = manifest.entrypointsByName?.[entryName] ?? manifest.entrypoints;

  assets.css = entrypoints?.filter((x) => x.endsWith('css')).map((x) => path.join('/', x));
  assets.js = entrypoints?.filter((x) => x.endsWith('js')).map((x) => path.join('/', x));

  return assets;
}
