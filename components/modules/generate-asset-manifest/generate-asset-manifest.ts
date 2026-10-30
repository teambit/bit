import type { Compilation } from '@rspack/core';

export type ManifestResult = {
  files: Record<string, string>;
  /**
   * assets of the `main` entry, kept for compilations that have exactly one entry.
   * empty when the compilation has no entry named `main` - read `entrypointsByName` instead.
   */
  entrypoints: string[];
  /** assets of every entry, keyed by entry name. */
  entrypointsByName: Record<string, string[]>;
};

function assetNames(entry: any): string[] {
  return (entry?.assets || [])
    .map((asset: any) => asset.name || asset)
    .filter((name: string) => !name.endsWith('.map'));
}

/**
 * Generate a CRA-compatible manifest object from an rspack compilation.
 *
 * Designed to be passed as the `generate` option of `rspack-manifest-plugin`:
 * ```ts
 * new RspackManifestPlugin({ fileName: 'asset-manifest.json', generate: generateAssetManifest })
 * ```
 *
 * A multi-entry compilation cannot describe itself with a single `entrypoints` list, so every
 * entry is also reported under `entrypointsByName`. Consumers that serve one entry of a
 * multi-entry build (the UI bundle's ssr middleware) pick their entry from there.
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
  const statsEntrypoints = ((stats as any).entrypoints || {}) as Record<string, any>;
  const entrypointsByName: Record<string, string[]> = {};
  for (const [name, entry] of Object.entries(statsEntrypoints)) {
    entrypointsByName[name] = assetNames(entry);
  }
  return { files, entrypoints: entrypointsByName.main || [], entrypointsByName };
}
