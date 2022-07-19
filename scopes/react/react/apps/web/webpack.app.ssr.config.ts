import { join, resolve } from 'path';
import * as fs from 'fs-extra';

const SSR_ENTRY_FILENAME = 'index.js';
export const SSR_OUTPUT_FOLDER = 'public/ssr';
const MAGIC_FOLDER = 'public'; // idk where this comes from
const SSR_MAIN_FILE = join(SSR_OUTPUT_FOLDER, MAGIC_FOLDER, SSR_ENTRY_FILENAME);

export function ssrConfig() {
  return {
    target: 'node',
    devtool: 'eval-cheap-source-map',

    output: {
      publicPath: '/ssr/',
      libraryTarget: 'commonjs',
      filename: SSR_ENTRY_FILENAME,
    },
  };
}

export async function loadBundle() {
  const entryFile = resolve('.', SSR_MAIN_FILE);
  if (!fs.existsSync(entryFile)) throw new Error('kutner to handle (no file)');

  const entry = await import(entryFile);
  const render = entry?.default;
  if (!render) throw new Error('kutner to handle (no render)');

  return { render };
}
