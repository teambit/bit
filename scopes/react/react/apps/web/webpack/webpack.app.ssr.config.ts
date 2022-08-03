import { join } from 'path';
import type { Configuration } from 'webpack';

const OUTPUT_FOLDER = 'public/bit-apps';
export const SSR_ENTRY_FILE = 'index.js';
/** _external_ base url for static files. (is not a folder)
 * @example
 * "http://localhost:3000/public/main.88a88d47d86aaabc0230.js"
 */
export const PUBLIC_PATH = '/public';

enum Targets {
  ssr = 'ssr',
  browser = 'browser',
}

export function calcOutputPath(appName: string, target: Targets | keyof typeof Targets) {
  return join(OUTPUT_FOLDER, appName, target);
}

export function clientConfig(): Configuration {
  return {
    output: { publicPath: PUBLIC_PATH, filename: '[name].[chunkhash].js' },
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

export function buildConfig({ outputPath }: { outputPath: string }): Configuration {
  return {
    output: {
      path: outputPath,
      publicPath: `/`,
      filename: '[name].[chunkhash].js',
    },
  };
}

export function ssrBuildConfig({ outputPath }: { outputPath: string }): Configuration {
  return {
    target: 'node',
    devtool: 'eval-cheap-source-map',

    output: {
      path: outputPath,
      publicPath: `/`,
      libraryTarget: 'commonjs',
      filename: 'index.js',
    },
  };
}
