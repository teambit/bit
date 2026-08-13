/**
 * A loader `exclude` for transpiling rules. It decides only about paths under `node_modules`, and
 * never excludes anything outside it - what happens there is up to the rule's own `test`. Under
 * `node_modules`: JavaScript is excluded, TypeScript is not, and declaration files are (they are
 * types, not modules to transpile).
 *
 * Excluding node_modules is about not re-processing already-transpiled third-party JavaScript. A
 * `.ts` file is never valid bundler input wherever it resolves from, and it does resolve from
 * node_modules in practice: a bit component consumed as a package can resolve to its sources,
 * because an injected pnpm copy is taken from the package directory before the compile fills its
 * `dist`, and the package entry then falls back to `index.ts`. With node_modules excluded
 * wholesale, such a bundle dies on the first `export type`.
 *
 * Shared so the UI and preview bundlers cannot drift apart on it.
 */
export const excludeNodeModulesJs = (path: string) =>
  /node_modules/.test(path) && !(/\.tsx?$/.test(path) && !/\.d\.tsx?$/.test(path));
