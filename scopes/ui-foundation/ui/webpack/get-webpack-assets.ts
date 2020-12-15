import { compilation as compilationType } from 'webpack';

// webpack results may be unstable (no types, no docs), and may not be available (when bundle already exists)
// consider using `asset-manifest.json` directly

export function getWebpackAssets(compilation?: compilationType.Compilation) {
  if (!compilation) return undefined;

  const publicPath = compilation.mainTemplate.outputOptions.publicPath;

  const mainEntry = compilation.entrypoints.get('main');
  if (!mainEntry) return undefined;

  const files = mainEntry.getFiles() as string[];
  const css = files.filter((x) => x.endsWith('.css')).map((p) => `${publicPath}/${p}`);
  const js = files.filter((x) => x.endsWith('.js')).map((p) => `${publicPath}/${p}`);

  const assets = { css, js };

  return assets;
}
