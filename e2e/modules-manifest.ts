import * as nodeApi from '@pnpm/napi';

/**
 * The subset of `.modules.yaml` the e2e suites assert on.
 *
 * `@pnpm/napi` returns the manifest untyped (`Record<string, unknown>`) because the engine owns
 * the file's full shape; the fields below are the ones bit's own settings are expected to reach.
 */
export type ModulesManifest = {
  hoistPattern?: string[];
  publicHoistPattern?: string[];
};

/**
 * read the `.modules.yaml` of an installed `node_modules`, or null when the directory has none.
 *
 * imported as a namespace rather than through `await import()`: the addon sets `module.exports`
 * from a call, so cjs-module-lexer detects no named exports and node's esm loader would hand back
 * a namespace holding only `default`.
 */
export async function readModulesManifest(modulesDir: string): Promise<ModulesManifest | null> {
  return (await nodeApi.readModulesManifest(modulesDir)) as ModulesManifest | null;
}
