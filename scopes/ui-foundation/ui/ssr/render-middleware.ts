import { Request, Response, NextFunction } from 'express';
import path from 'path';
import * as fs from 'fs-extra';
import { requestToObj } from './request-browser';
import { SsrContent } from './ssr-content';
import type { Assets } from './html';

const denyList = /^\/favicon.ico$/;

type ssrRenderProps = {
  root: string;
  port: number;
  title: string;
};

type ManifestFile = {
  files?: Record<string, string>;
  entrypoints?: string[];
};

export async function createSsrMiddleware({ root, port, title }: ssrRenderProps) {
  const runtime = await loadRuntime(root);
  if (!runtime) return undefined;

  const { render } = runtime;
  const assets = { ...runtime.assets, title };

  return async function serverRenderMiddleware(req: Request, res: Response, next: NextFunction) {
    const { query, url } = req;

    const browser = requestToObj(req, port);

    if (denyList.test(url)) {
      console.log('[ssr] skipping static file', url);
      next();
      return;
    }

    if (query.rendering !== 'server') {
      console.log('[ssr] skipping', url);
      next();
      return;
    }

    console.log('[ssr]', req.method, url);
    const props: SsrContent = { assets, browser };

    try {
      const rendered = await render(props);
      console.log('[ssr]', 'success', url);
      res.set('Cache-Control', 'no-cache');
      res.send(rendered);
    } catch (e) {
      console.error(e, e.stack);
      next();
    }
  };
}

async function loadRuntime(root: string) {
  let render: (...arg: any[]) => any;
  let assets: Assets | undefined;

  try {
    const entryFilepath = path.join(root, 'ssr', 'index.js');
    const manifestFilepath = path.join(root, 'asset-manifest.json');
    if (!fs.existsSync(entryFilepath)) {
      console.log('[ssr] - Failed finding ssr/index.js. Skipping setup.');
      return undefined;
    }
    if (!fs.existsSync(manifestFilepath)) {
      console.log('[ssr] - Failed finding asset manifest file. Skipping setup.');
      return undefined;
    }

    assets = await parseManifest(manifestFilepath);
    if (!assets) {
      console.log('[ssr] - failed parsing assets manifest. Skipping setup.');
      return undefined;
    }

    const imported = await import(entryFilepath);
    render = imported?.render;

    if (!render || typeof render !== 'function') {
      console.log('[ssr] - index file does not export a render() function. Skipping setup.');
      return undefined;
    }
  } catch (e) {
    console.error('[ssr]', e);
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
