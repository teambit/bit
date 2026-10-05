import { readFileSync, statSync } from 'fs';
import { join } from 'path';
import type { Plugin } from 'esbuild';
import { resolvePackageDir } from '../resolve-package-dir';

/**
 * Resolve every `@teambit/*` workspace component to its **compiled `dist`**, uniformly.
 *
 * Why this is needed, and why it is not a micro-optimisation:
 *
 * A workspace component's package.json declares
 *   `"."      -> { node: { require: "./dist/index.js", import: "./dist/esm.mjs" } }`
 *   `"./*"    -> "./*.ts"`
 * so the *same module* resolves to three different files depending on how it was imported:
 * `@teambit/cli` (from a TS file, i.e. an `import`) → `dist/esm.mjs` → `dist/index.js`;
 * `@teambit/cli` (from a `require`) → `dist/index.js`; and `@teambit/cli/cli.main.runtime` →
 * `cli.main.runtime.ts`, the *source*. A bundler follows each of those literally and ends up with
 * two copies of the same aspect - two `CLIAspect` objects, two runtime registries. Harmony would
 * then register a runtime on one object and look it up on the other.
 *
 * On top of that, `esm.mjs` is a hand-maintained bridge that enumerates named exports; components
 * that never needed one simply don't have it, which is what makes the default resolution fail
 * outright for `@teambit/validator`, `@teambit/objects`, `@teambit/config-store` and friends.
 * `bit-bundle2` responded by hand-writing ~50 `esm.mjs` files. Normalising resolution here removes
 * the whole class of problem instead.
 *
 * Non-workspace `@teambit/*` packages (regular npm packages such as `@teambit/harmony` or
 * `@teambit/toolbox.*`) are left to esbuild, only retried with `require` semantics if the ESM path
 * doesn't exist.
 */

type PkgInfo = { dir: string; isBitComponent: boolean; hasLocalSources: boolean; main: string };

const CANDIDATE_SUFFIXES = ['.js', '/index.js', '', '.json', '.cjs'];

function splitSpecifier(specifier: string) {
  const parts = specifier.split('/');
  const packageName = `${parts[0]}/${parts[1]}`;
  const subPath = parts.slice(2).join('/');
  return { packageName, subPath };
}

function firstExisting(candidates: string[]): string | undefined {
  return candidates.find((candidate) => {
    try {
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

export function teambitDistResolverPlugin(repoRoot: string): Plugin {
  const pkgCache = new Map<string, PkgInfo | undefined>();

  const getPkgInfo = (packageName: string): PkgInfo | undefined => {
    if (pkgCache.has(packageName)) return pkgCache.get(packageName);
    // resolve rather than path-join: under a capsule most packages hoist to the capsule root, which
    // a join from `repoRoot` never sees. See `resolve-package-dir.ts`.
    const dir = resolvePackageDir(repoRoot, packageName);
    let info: PkgInfo | undefined;
    if (dir) {
      try {
        const parsed = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
        // `_bit_local` is set only in this workspace. A capsule's copies of the very same components
        // do not carry it, which is why normalisation silently stopped applying during a real build
        // and esbuild fell through to the `exports` map. `componentId` marks a bit component in every
        // layout - workspace, capsule and published alike - and all 298 of them in a capsule root
        // ship a `dist`.
        info = {
          dir,
          isBitComponent: Boolean(parsed._bit_local || parsed.componentId),
          hasLocalSources: Boolean(parsed._bit_local),
          // the entry file is NOT always `dist/index.js` - a component whose source root is
          // `constants.ts` compiles to `dist/constants.js`, so `main` is the only reliable answer.
          main: parsed.main || 'dist/index.js',
        };
      } catch {
        info = undefined;
      }
    }
    pkgCache.set(packageName, info);
    return info;
  };

  return {
    name: 'teambit-dist-resolver',
    setup(build) {
      build.onResolve({ filter: /^@teambit\/[^/]+(\/.*)?$/ }, async (args) => {
        if (args.pluginData?.teambitResolved) return undefined;
        const { packageName, subPath } = splitSpecifier(args.path);
        const info = getPkgInfo(packageName);

        if (info?.isBitComponent) {
          // package.json must stay literal - it is read as data, not imported as code
          if (subPath === 'package.json') return { path: join(info.dir, 'package.json') };
          // paths that already address a real on-disk location keep their shape
          const alreadyAddressed = subPath.startsWith('dist/') || subPath.startsWith('artifacts/');
          const base = subPath
            ? join(info.dir, alreadyAddressed ? subPath : join('dist', subPath))
            : join(info.dir, info.main);
          const resolved = firstExisting(subPath ? CANDIDATE_SUFFIXES.map((s) => `${base}${s}`) : [base]);
          if (resolved) return { path: resolved };
          // A workspace component that has no compiled file is a real error - the whole bundle is
          // built from `dist`, so an uncompiled one would be silently missing. A *published* bit
          // component with an unexpected layout is not: let esbuild resolve it its own way rather
          // than fail the build over a normalisation that was only ever an optimisation for it.
          if (info.hasLocalSources) {
            return {
              errors: [
                {
                  text: `[teambit-dist-resolver] cannot find a compiled file for "${args.path}" under ${info.dir}/dist - is the workspace compiled? (run "bit compile")`,
                },
              ],
            };
          }
        }

        // a regular npm package. let esbuild resolve it, but if the ESM branch of its exports map
        // points at a file that isn't there, retry as a `require` - which is how bit loads it anyway.
        const asIs = await build.resolve(args.path, {
          kind: args.kind,
          resolveDir: args.resolveDir,
          importer: args.importer,
          pluginData: { teambitResolved: true },
        });
        if (!asIs.errors.length) return asIs;
        const asRequire = await build.resolve(args.path, {
          kind: 'require-call',
          resolveDir: args.resolveDir,
          importer: args.importer,
          pluginData: { teambitResolved: true },
        });
        return asRequire.errors.length ? asIs : asRequire;
      });
    },
  };
}
