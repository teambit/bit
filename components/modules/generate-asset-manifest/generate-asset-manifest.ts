import type { Compilation } from '@rspack/core';

export type ManifestResult = {
  files: Record<string, string>;
  entrypoints: string[];
};

/**
 * Generate a CRA-compatible manifest object from an rspack compilation.
 *
 * Designed to be passed as the `generate` option of `rspack-manifest-plugin`:
 * ```ts
 * new RspackManifestPlugin({ fileName: 'asset-manifest.json', generate: generateAssetManifest })
 * ```
 */
export function generateAssetManifest(
  _seed: Record<string, any>,
  _files: any[],
  _entrypoints: Record<string, string[]>,
  extra: { compilation: Compilation }
): ManifestResult {
  const { compilation } = extra;
  const files: Record<string, string> = {};
  for (const asset of (compilation as any).getAssets()) {
    if (asset.name) files[asset.name] = `/${asset.name}`;
  }
  const stats = compilation.getStats().toJson({ all: false, entrypoints: true });
  const mainEntry = (stats as any).entrypoints?.main;
  const entrypoints = (mainEntry?.assets || [])
    .map((a: any) => a.name || a)
    .filter((name: string) => !name.endsWith('.map'));
  return { files, entrypoints };
}
