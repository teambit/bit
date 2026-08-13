/**
 * A loader `exclude` for transpiling rules: skips JavaScript under node_modules, but lets
 * TypeScript through from anywhere (declaration files excluded).
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
