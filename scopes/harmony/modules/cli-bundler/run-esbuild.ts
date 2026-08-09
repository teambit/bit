import type { BuildResult } from 'esbuild';
import { build } from 'esbuild';
import { ignoreAssetsPlugin } from './plugins/ignore-assets-plugin';
import { teambitDistResolverPlugin } from './plugins/teambit-dist-resolver-plugin';
import { timePlugin } from './plugins/time-plugin';
import { workerEntryPlugin } from './plugins/worker-entry-plugin';

export type EsbuildOptions = {
  entryFilePath: string;
  outFilePath: string;
  repoRoot: string;
  externals: string[];
  minify?: boolean;
  sourcemap?: boolean;
  /**
   * Wrap the output so it can run as a Node Single Executable Application. Inside a SEA the ambient
   * `require` resolves built-ins only, and `__dirname`/`__filename` point at nothing useful - but
   * the bundle needs both: `require` for the externals, `__dirname` for the data files it reads.
   * The wrapper rebuilds them from a real on-disk directory next to the executable.
   */
  seaWrapper?: boolean;
  label?: string;
};

const IMPORT_META_BANNER = [
  `const { pathToFileURL: __bit_pathToFileURL } = require('url');`,
  `const bit_import_meta_url = __bit_pathToFileURL(__filename).href;`,
].join('\n');

/**
 * Inside a SEA the ambient `require` resolves built-in modules only, and `__dirname`/`__filename`
 * point at nothing useful - but the bundle needs both: `require` for the externals, `__dirname` for
 * the data files it reads. This rebuilds all three.
 *
 * They are rebound with `var`, deliberately. Node runs the injected main script inside a function
 * whose parameters are `require`/`__filename`/`__dirname`, and re-declaring a parameter with `var`
 * simply reassigns it - legal in strict mode too. The obvious alternative, wrapping the whole bundle
 * in an IIFE that takes them as arguments, is a **2x startup regression**: V8 eagerly compiles a
 * 67 MB function body instead of lazily compiling top-level statements, and the code cache cannot
 * recover it (measured: 1.44s vs 0.63s for `bit --help`).
 *
 * The RHS of the `require` line still sees the original SEA `require`, because a `var` declaration
 * hoists the binding but assigns left-to-right.
 *
 * `BIT_BUNDLE_DIR` lets the executable be moved away from its support directory; by default the
 * layout is `<dir>/bit-app` next to `<dir>/bundle/`.
 */
const SEA_BANNER = [
  `var __bitPath = require('node:path');`,
  `var __bitBaseDir = process.env.BIT_BUNDLE_DIR || __bitPath.join(__bitPath.dirname(process.execPath), 'dist', 'core-aspects', 'bundle');`,
  `var __filename = __bitPath.join(__bitBaseDir, 'bit.app.js');`,
  `var __dirname = __bitBaseDir;`,
  `var require = require('node:module').createRequire(__filename);`,
  IMPORT_META_BANNER,
].join('\n');

export function runEsbuild({
  entryFilePath,
  outFilePath,
  repoRoot,
  externals,
  minify,
  sourcemap,
  seaWrapper,
  label = 'bit bundle',
}: EsbuildOptions): Promise<BuildResult> {
  return build({
    entryPoints: [entryFilePath],
    outfile: outFilePath,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    // bit resolves aspects and commands by constructor/function name in a few places
    keepNames: true,
    metafile: true,
    minify: Boolean(minify),
    sourcemap: sourcemap ? 'linked' : false,
    logLevel: 'warning',
    logLimit: 0,
    mainFields: ['main', 'module'],
    external: externals,
    define: {
      // a compile-time constant. the non-bundled build is unaffected (and dead-code-eliminates the
      // bundle-only branches), while the bundle takes them.
      'process.env.BIT_IS_BUNDLE': '"true"',
      // several deps read `import.meta.url`; in a cjs output that's a syntax error, so it is
      // rewritten to a value the banner defines.
      'import.meta.url': 'bit_import_meta_url',
    },
    banner: { js: seaWrapper ? SEA_BANNER : IMPORT_META_BANNER },
    loader: {
      '.node': 'file',
      '.png': 'file',
      '.svg': 'file',
      '.txt': 'text',
      '.html': 'text',
    },
    alias: {
      // `batch` (pulled in through express/serve-index) requires a package called `emitter` that
      // hasn't existed for a decade; node's own EventEmitter is API-compatible for its usage.
      emitter: 'events',
    },
    plugins: [workerEntryPlugin(), teambitDistResolverPlugin(repoRoot), ignoreAssetsPlugin(), timePlugin(label)],
  });
}
