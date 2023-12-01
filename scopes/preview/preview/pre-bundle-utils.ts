/**
 * @fileoverview
 */

import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs-extra';
import { UIRoot } from '@teambit/ui';
import { configBaseFactory } from '@teambit/react.webpack.react-webpack';
import { getAspectDirFromBvm } from '@teambit/aspect-loader';
import { SlotRegistry } from '@teambit/harmony';
import { ArtifactDefinition } from '@teambit/builder';
import { sha1 } from '@teambit/legacy/dist/utils';

import { Configuration, ProvidePlugin } from 'webpack';
import { merge } from 'webpack-merge';
import { fallbacksProvidePluginConfig, fallbacks } from '@teambit/webpack';
import { WebpackManifestPlugin } from 'webpack-manifest-plugin';
import WorkboxWebpackPlugin from 'workbox-webpack-plugin';

/// webpack config

export function createWebpackConfig(outputDir: string, entryFile: string): Configuration {
  const baseConfig = configBaseFactory(true);
  const preBundleConfig = createPreBundleConfig(outputDir, entryFile);

  // @ts-ignore that's an issue because of different types/webpack version
  const combined = merge(baseConfig, preBundleConfig);

  // @ts-ignore that's an issue because of different types/webpack version
  return combined;
}

function createPreBundleConfig(outputDir: string, entryFile: string) {
  const preBundleConfig: Configuration = {
    stats: {
      children: true,
      errorDetails: true,
    },
    mode: 'production',
    entry: {
      main: entryFile,
    },
    resolve: {
      alias: {
        'react/jsx-runtime': require.resolve('react/jsx-runtime'),
        react: require.resolve('react'),
        'react-dom': require.resolve('react-dom'),
      },
      fallback: {
        module: false,
        path: fallbacks.path,
        dgram: false,
        dns: false,
        fs: false,
        stream: false,
        http2: false,
        net: false,
        tls: false,
        child_process: false,
        process: fallbacks.process,
      },
    },
    output: {
      path: outputDir,
      chunkFilename: 'static/js/[name].[contenthash:8].chunk.js',
      filename: 'static/js/[name].[contenthash:8].js',
      library: {
        type: 'commonjs2',
      },
    },
    externalsType: 'commonjs',
    externals: [
      'react',
      'react-dom',
      '@mdx-js/react',
      '@teambit/mdx.ui.mdx-scope-context',
      '@teambit/preview.modules.preview-modules',
    ],
    plugins: [
      // Generate an asset manifest file with the following content:
      // - "files" key: Mapping of all asset filenames to their corresponding
      //   output file so that tools can pick it up without having to parse
      //   `index.html`
      //   can be used to reconstruct the HTML if necessary
      new WebpackManifestPlugin({
        fileName: 'asset-manifest.json',
        generate: (seed, files, entrypoints) => {
          const manifestFiles = files.reduce((manifest, file) => {
            manifest[file.name] = file.path;
            return manifest;
          }, seed);
          const entrypointFiles = entrypoints.main.filter((fileName) => !fileName.endsWith('.map'));

          // @ts-ignore - https://github.com/shellscape/webpack-manifest-plugin/issues/276
          return {
            files: manifestFiles,
            entrypoints: entrypointFiles,
          } as Record<string, string>;
        },
      }),

      // Generate a service worker script that will precache, and keep up to date,
      // the HTML & assets that are part of the webpack build.
      new WorkboxWebpackPlugin.GenerateSW({
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 5000000,
        exclude: [/\.map$/, /asset-manifest\.json$/],
        // importWorkboxFrom: 'cdn',
        navigateFallback: 'public/index.html',
        navigateFallbackDenylist: [
          // Exclude URLs starting with /_, as they're likely an API call
          new RegExp('^/_'),
          // Exclude any URLs whose last part seems to be a file extension
          // as they're likely a resource and not a SPA route.
          // URLs containing a "?" character won't be blacklisted as they're likely
          // a route with query params (e.g. auth callbacks).
          new RegExp('/[^/?]+\\.[^/]+$'),
        ],
      }),

      new ProvidePlugin({ process: fallbacksProvidePluginConfig.process }),
    ],
  };

  return preBundleConfig;
}

/// utils

export type UIRootRegistry = SlotRegistry<UIRoot>;

// bundle hash

export const BUNDLE_HASH_FILENAME = '.hash';

export function readBundleHash(bundleId: string, bundleDir: string, aspectDir: string): string {
  const bundleUiPathFromBvm = getBundlePath(bundleId, bundleDir, aspectDir);
  if (!bundleUiPathFromBvm) {
    return '';
  }
  const hashFilePath = join(bundleUiPathFromBvm, BUNDLE_HASH_FILENAME);
  if (existsSync(hashFilePath)) {
    return readFileSync(hashFilePath).toString();
  }
  return '';
}

export async function createBundleHash(uiRoot: UIRoot, runtime: string): Promise<string> {
  const aspects = await uiRoot.resolveAspects(runtime);
  aspects.sort((a, b) => ((a.getId || a.aspectPath) > (b.getId || b.aspectPath) ? 1 : -1));
  const aspectPathStrings = aspects.map((aspect) => {
    return [aspect.aspectPath, aspect.runtimePath].join('');
  });
  return sha1(aspectPathStrings.join(''));
}

export async function generateBundleHash(uiRoot: UIRoot, runtime: string, outputPath: string): Promise<void> {
  const hash = await createBundleHash(uiRoot, runtime);
  if (!existsSync(outputPath)) mkdirSync(outputPath);
  writeFileSync(join(outputPath, BUNDLE_HASH_FILENAME), hash);
}

// bundle artifact

export function getBundleArtifactDirectory(bundleDir: string, aspectDir: string) {
  return join('artifacts', bundleDir, aspectDir);
}

export function getBundleArtifactDef(bundleDir: string, aspectDir: string): ArtifactDefinition {
  const rootDir = getBundleArtifactDirectory(bundleDir, aspectDir);
  return {
    name: `${bundleDir}${aspectDir ? '-' : ''}${aspectDir}`,
    globPatterns: [`${rootDir}/**`],
  };
}

export function getBundlePath(bundleId: string, bundleDir: string, aspectDir: string): string | undefined {
  try {
    const dirFromBvms = getAspectDirFromBvm(bundleId);
    const bundlePath = join(dirFromBvms, getBundleArtifactDirectory(bundleDir, aspectDir));
    // // eslint-disable-next-line no-console
    // console.log('\n[getBundlePath]', {
    //   bundleId,
    //   bundleDir,
    //   aspectDir,
    //   dirFromBvms,
    //   bundlePath,
    // })
    if (!existsSync(bundlePath)) {
      return undefined;
    }
    return bundlePath;
  } catch (err) {
    // TODO: logger -> move external
    // this.logger.error(`getBundlePath, getAspectDirFromBvm failed with err: ${err}`);
    return undefined;
  }
}

// others

export function clearConsole() {
  process.stdout.write(process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H');
}
