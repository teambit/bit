import { Request, Response, NextFunction } from 'express';
import path from 'path';
import * as fs from 'fs-extra';

const staticFiles = /\.(ico|js|css|html|js\.map|css\.map|LICENCE.txt)$/;

type ssrRenderProps = {
  rootPath: string;
};

type ManifestFile = {
  files: Record<string, string>;
  entrypoints: string[];
};

type Assets = { css: string[]; js: string[] };

export async function ssrRenderer({ rootPath }: ssrRenderProps) {
  let render: (...arg: any[]) => any;
  let assets: Assets;

  try {
    // TODO - proper path
    const manifest = await parseManifest(path.join(rootPath, 'public', 'asset-manifest.json'));
    if (!manifest) return undefined;
    assets = getAssets(manifest);

    const entryFile = path.join(rootPath, 'public', 'ssr', 'index.js');

    const imported = await import(entryFile);
    render = imported?.render;

    if (!render) return undefined;
  } catch (e) {
    console.error('error!', e);
    return undefined;
  }

  return function ssrRenderingMiddleware(req: Request, res: Response, next: NextFunction) {
    const { query, url } = req;

    // TODO - ssr Middelware should run after static files middleware
    if (staticFiles.test(url)) {
      next();
      return;
    }

    if (query.rendering !== 'server') {
      console.log('ssr bounce', url);
      next();
      return;
    }

    console.log('ssr', url);
    Promise.resolve(render(assets))
      .then((rendered) => {
        res.send(rendered);
      })
      .catch((e) => {
        res.send(`exception during SSR! ${e.toString()}`);
      });
  };
}

async function parseManifest(filepath: string) {
  try {
    const file = await fs.readFile(filepath);
    const contents = file.toString();
    const parsed: ManifestFile = JSON.parse(contents);
    return parsed;
  } catch (e) {
    return undefined;
  }
}

function getAssets(manifest: { files: Record<string, string>; entrypoints: string[] }) {
  const assets: Assets = { css: [], js: [] };

  assets.css = manifest.entrypoints.filter((x) => x.endsWith('css')).map((x) => path.join('/', x));
  assets.js = manifest.entrypoints.filter((x) => x.endsWith('js')).map((x) => path.join('/', x));

  return assets;
}
