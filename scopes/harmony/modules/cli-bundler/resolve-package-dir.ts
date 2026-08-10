import { existsSync, realpathSync } from 'fs';
import { dirname, join, parse, sep } from 'path';

/**
 * Find a package's directory the way node would, rather than assuming one lives at
 * `<from>/node_modules/<pkg>`.
 *
 * That assumption holds for this repo and fails everywhere else that matters. Capsules share a
 * hoisted root: for `@teambit/bit`'s capsule, 74 of its `@teambit/*` dependencies sit in its own
 * `node_modules` and the other ~225 hoist to `<capsule-root>/node_modules`, which node finds by
 * walking up and a path-join never does. Walking the same chain covers every layout at once -
 * pnpm's nested store, npm's hoisting, capsules - with no per-layout special-casing.
 *
 * `require.resolve` is deliberately not used: `@teambit/*` packages publish an `exports` map with
 * `"./*": "./*.ts"`, which blocks `<pkg>/package.json` outright, and resolving `"."` would hand back
 * an entry *file* whose package root then has to be re-derived anyway.
 */
export function resolvePackageDir(from: string, packageName: string): string | undefined {
  const { root } = parse(from);
  let dir = from;
  for (;;) {
    // don't form `.../node_modules/node_modules` when the walk starts inside a package
    if (!dir.endsWith(`${sep}node_modules`)) {
      const candidate = join(dir, 'node_modules', packageName);
      if (existsSync(join(candidate, 'package.json'))) {
        // Return where the package really lives, not the symlink that pointed at it. Under pnpm the
        // entry in a `node_modules` is a link into a store slot, and a package's own dependencies sit
        // in that slot's `node_modules`. Resolving imports relative to the *link* walks up the
        // consumer's tree instead and misses them - which shows up as a wall of "Could not resolve"
        // for transitive deps that are in fact installed.
        try {
          return realpathSync(candidate);
        } catch {
          return candidate;
        }
      }
    }
    if (dir === root) return undefined;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
