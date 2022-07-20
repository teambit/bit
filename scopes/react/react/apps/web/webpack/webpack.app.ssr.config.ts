import { Asset } from '@teambit/bundler';
import type { SsrContent } from '@teambit/ui/react-ssr';
import * as fs from 'fs-extra';
import { join, resolve } from 'path';
import urlJoin from 'url-join';
import type { Configuration } from 'webpack';

// TODO - workspace path
const OUTPUT_FOLDER = 'public/bit-apps';
const SSR_ENTRY_FILE = 'index.js';
/** base url for static files */
export const PUBLIC_PATH = '/public';
/** idk where this is coming from */
const MAGIC_FOLDER = 'public';

enum Targets {
  ssr = 'ssr',
  browser = 'browser',
}

export function calcOutputPath(appName: string, target: Targets | keyof typeof Targets) {
  return join(OUTPUT_FOLDER, appName, target);
}

export function clientConfig(): Configuration {
  return {
    output: { publicPath: PUBLIC_PATH },
  };
}

export function ssrConfig(): Configuration {
  return {
    target: 'node',
    devtool: 'eval-cheap-source-map',

    output: {
      libraryTarget: 'commonjs',
      filename: SSR_ENTRY_FILE,
    },
  };
}

export async function loadSsrApp(appName: string) {
  const entryFile = resolve(calcOutputPath(appName, Targets.ssr), MAGIC_FOLDER, SSR_ENTRY_FILE);
  if (!fs.existsSync(entryFile)) throw new Error(`expected ssr bundle entry file at "${entryFile}"`);

  const entry = await import(entryFile);
  const app = entry?.default;
  if (!app) throw new Error(`bundle entry file has no default export (at "${entryFile}")`);

  return app;
}

export function parseAssets(assets: Asset[], publicPath = PUBLIC_PATH): SsrContent['assets'] {
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
