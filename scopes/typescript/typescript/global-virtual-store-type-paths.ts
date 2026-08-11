/**
 * The type-resolution half of the hoisted-resolution bridge.
 *
 * `NODE_PATH` and the ESM loader in `@teambit/dependency-resolver`'s
 * `hoisted-resolution-bridge` repair `require`/`import` for packages that live in pnpm's global
 * virtual store. TypeScript reads neither, so under that layout a `.d.ts` in a store slot still
 * cannot reach the workspace's `@types`: it resolves `react` to `react/index.js`, gets no
 * typings, and every type derived from it silently degrades - props lose `children`, generics
 * collapse to `unknown` - long before anything errors out at a place that names the cause.
 *
 * TypeScript's only lever here is `paths`, which is a *redirect* and not the fallback `NODE_PATH`
 * is, so a blanket mapping does real damage: pointing every `@types` package at the bridge
 * directories overrides packages that ship their own typings, and the resolution that used to be
 * a last resort starts winning over a package's declared, newer types. This module maps only what
 * the walk used to find and nothing else:
 *
 * - a `@types/x` mapping only when `x` itself ships no typings. That is the case the walk-up
 *   existed for; when `x` is self-typed, the walk stopped at `x` and never reached `@types/x`.
 * - `@teambit/*` from the root's own `node_modules`, never the hoisted directory. Core aspects
 *   have to be the single copy from the running installation (the same invariant
 *   `DependencyLinker` maintains), and the hoisted directory holds transitive - older - copies
 *   that would otherwise win.
 */
import * as fs from 'fs';
import * as path from 'path';
import { hoistedResolutionDirs } from '@teambit/dependency-resolver';

export type TypePaths = Record<string, string[]>;

/**
 * `@types/react` -> `react`, `@types/babel__core` -> `@babel/core`. The double underscore is
 * DefinitelyTyped's mangling for a scope separator, and only the first one is the separator - a
 * package whose own name contains `__` keeps it.
 */
export function typesDirToSpecifier(dirName: string): string {
  const separator = dirName.indexOf('__');
  if (separator === -1) return dirName;
  return `@${dirName.slice(0, separator)}/${dirName.slice(separator + 2)}`;
}

type PackageManifest = {
  types?: unknown;
  typings?: unknown;
  typesVersions?: unknown;
  exports?: unknown;
  main?: unknown;
};

/** Whether an `exports` map declares a `types` condition anywhere in its conditional nesting. */
function exportsDeclareTypes(exportsField: unknown): boolean {
  if (!exportsField || typeof exportsField !== 'object') return false;
  return Object.entries(exportsField as Record<string, unknown>).some(
    ([condition, target]) => condition === 'types' || exportsDeclareTypes(target)
  );
}

/** Every file an `exports` map points at, at any depth of subpath and condition nesting. */
function exportTargets(exportsField: unknown, collected: string[] = []): string[] {
  if (typeof exportsField === 'string') collected.push(exportsField);
  else if (exportsField && typeof exportsField === 'object') {
    Object.values(exportsField as Record<string, unknown>).forEach((target) => exportTargets(target, collected));
  }
  return collected;
}

/** Every extension a declaration file can carry: `.mjs` is typed by `.d.mts`, `.cjs` by `.d.cts`. */
const DECLARATION_EXTENSIONS = ['.d.ts', '.d.mts', '.d.cts'];

/**
 * The declaration file TypeScript infers from an entry point, which is how a package ships types
 * without saying so: `dist/index.js` is typed by `dist/index.d.ts`, and a directory entry point by
 * an `index.d.ts` inside it.
 *
 * All three extensions are tried against each shape rather than the one paired with the entry's
 * own extension. Being too eager here only skips a mapping; missing one redirects the specifier to
 * `@types` and buries the declarations the package actually ships.
 */
function declarationsBesideEntry(packageDir: string, main: unknown): boolean {
  const entry = typeof main === 'string' && main ? main : 'index.js';
  const resolved = path.join(packageDir, entry);
  const withoutExtension = resolved.replace(/\.(js|cjs|mjs|jsx)$/, '');
  return DECLARATION_EXTENSIONS.some(
    (extension) =>
      fs.existsSync(`${withoutExtension}${extension}`) ||
      fs.existsSync(path.join(resolved, `index${extension}`)) ||
      fs.existsSync(path.join(packageDir, `index${extension}`))
  );
}

/**
 * Whether the package the specifier names ships typings of its own, judged at the first bridge
 * directory that holds it - the same copy the resolver reaches. A package that is not installed
 * at either counts as untyped: nothing shadows the `@types` mapping in that case.
 *
 * Every form a package can ship types in has to count, because a false negative here is not a
 * missed optimization - it redirects a specifier to `@types` and *overrides* the package's own,
 * usually newer, declarations. `types`/`typings`, a `types` condition in `exports`,
 * `typesVersions`, and the declaration file inferred from an entry point - `main` for the classic
 * resolver, any `exports` target for the modern one - all mean the same thing to the resolver,
 * which reached the package itself and never looked at `@types` at all.
 */
function shipsOwnTypes(specifier: string, dirs: string[]): boolean {
  for (const dir of dirs) {
    const packageDir = path.join(dir, specifier);
    let manifest: PackageManifest;
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
    } catch {
      continue; // not in this directory - keep looking in the next
    }
    if (typeof manifest.types === 'string' || typeof manifest.typings === 'string') return true;
    if (manifest.typesVersions && typeof manifest.typesVersions === 'object') return true;
    if (exportsDeclareTypes(manifest.exports)) return true;
    const entries = [manifest.main, ...exportTargets(manifest.exports)];
    return entries.some((entry) => declarationsBesideEntry(packageDir, entry));
  }
  return false;
}

/**
 * `paths` entries that let a store slot resolve the types it used to reach by walking up out of
 * `node_modules/.pnpm`. Derived purely from {@link hoistedResolutionDirs}, so a root whose
 * directories are gone yields an empty mapping.
 *
 * The layout is the caller's to check. This reads no `.modules.yaml` and asks no questions about
 * the virtual store: a project-local root would get a mapping too, pointing at the same `@types`
 * its own walk already reaches - unnecessary rather than wrong, but unnecessary is reason enough
 * to keep it out. Callers decide per root, gating on `isGlobalVirtualStoreLayout`, because they
 * are the ones holding several roots and deciding which of them participate.
 *
 * Reads the directories on every call rather than caching them: an install can move a workspace
 * onto the global virtual store mid-process, and the envs compiled right after it would otherwise
 * be handed the layout from before.
 */
export function globalVirtualStoreTypePaths(root: string): TypePaths {
  const dirs = hoistedResolutionDirs(root);
  if (!dirs.length) return {};
  const paths: TypePaths = {};
  for (const dir of dirs) {
    const typesDir = path.join(dir, '@types');
    let entries: string[];
    try {
      entries = fs.readdirSync(typesDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const specifier = typesDirToSpecifier(entry);
      // walk order decides: the hoisted directory is reached first, so it keeps the specifier
      if (paths[specifier] || shipsOwnTypes(specifier, dirs)) continue;
      paths[specifier] = [path.join(typesDir, entry)];
    }
  }
  const coreAspects = path.join(root, 'node_modules', '@teambit');
  if (fs.existsSync(coreAspects)) {
    paths['@teambit/*'] = [path.join(coreAspects, '*')];
  }
  return paths;
}

/**
 * Merge bridge entries under whatever the env and the component already configured: a specifier
 * someone mapped deliberately keeps its mapping, and the bridge only fills in what would
 * otherwise resolve to nothing.
 */
export function mergeTypePaths(configured: TypePaths | undefined, bridged: TypePaths): TypePaths {
  return { ...bridged, ...configured };
}
