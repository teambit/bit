import ignorePlugin from 'esbuild-plugin-ignore';
import { build, Options } from 'tsup';
import { configFilesEsbuildPlugin } from './config-files-esbuild-plugin';
import { timeEsbuildPlugin } from './esbuild-plugin-time';
import { externals } from './externals';

export async function runTsup(outDir: string, _appFile: string) {
  const opts: Options = {
    entry: ['/Users/giladshoham/dev/bit/bit/scopes/harmony/bit/app.ts'],
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: true,
    format: ['cjs'],
    target: 'node18',
    outDir,
    platform: 'node',
    external: externals,
    keepNames: true,
    esbuildPlugins: [
      ignorePlugin([
        // { resourceRegExp: /(.*)\.ui\.runtime\.*/g },
        { resourceRegExp: /\.(s[ac]ss|css)$/ },
        { resourceRegExp: /\.(mdx)$/ },
        { resourceRegExp: /\.(md)$/ },
        { resourceRegExp: new RegExp('^jest-resolve') },
        { resourceRegExp: new RegExp('^@vue/compiler-sfc') },
        { resourceRegExp: new RegExp('^batch') },
        { resourceRegExp: new RegExp('^../build/Release/cpufeatures.node') },
        { resourceRegExp: new RegExp('^pnpapi') },
        { resourceRegExp: new RegExp('^esbuild') },
      ]),
      configFilesEsbuildPlugin(outDir),
      timeEsbuildPlugin('Bit bundle'),
    ],
    esbuildOptions(options, _context) {
      options.define['process.env.BIT_LOG'] = '"debug"';
    },
  };
  return build(opts);
}
