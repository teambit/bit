import type { Compiler } from '@rspack/core';

export class RspackManifestPlugin {
  private fileName: string;
  constructor(options: { fileName: string }) {
    this.fileName = options.fileName;
  }

  apply(compiler: Compiler) {
    compiler.hooks.thisCompilation.tap('RspackManifestPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: 'RspackManifestPlugin', stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE },
        () => {
          const files: Record<string, string> = {};
          for (const asset of (compilation as any).getAssets()) {
            if (asset.name) files[asset.name] = `/${asset.name}`;
          }
          const stats = compilation.getStats().toJson({ all: false, entrypoints: true });
          const mainEntry = stats.entrypoints?.main;
          const entrypoints = (mainEntry?.assets || [])
            .map((a: any) => a.name || a)
            .filter((name: string) => !name.endsWith('.map'));

          const manifest = JSON.stringify({ files, entrypoints }, null, 2);
          compilation.emitAsset(this.fileName, new compiler.webpack.sources.RawSource(manifest));
        }
      );
    });
  }
}
