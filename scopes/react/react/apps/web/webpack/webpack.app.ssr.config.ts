import { join } from 'path';
import type { Configuration } from 'webpack';

// TODO - workspace path
const OUTPUT_FOLDER = 'public/bit-apps';
export const SSR_ENTRY_FILE = 'index.js';
/** base url for static files */
export const PUBLIC_PATH = '/public';
/** idk where this is coming from */

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
