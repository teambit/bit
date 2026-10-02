/**
 * Files that a *separate process* loads by absolute path at runtime.
 *
 * `worker.declareWorker(name, path)` hands the path to `jest-worker`, which spawns a child process
 * and `require`s it there. Such a file can never live inside the main bundle - so each one is built
 * as its own self-contained esbuild bundle next to the CLI, and the `require.resolve` that produced
 * the path is rewritten to point at it.
 */
export type WorkerEntry = {
  /** the specifier as written in the source, used to recognise the `require.resolve` call */
  matches: RegExp;
  /** package that owns the file (a `_bit_local` @teambit component) */
  packageName: string;
  /** path of the compiled worker inside that package */
  sourcePath: string;
  /** output path, relative to the bundle dir */
  outPath: string;
};

export const WORKER_ENTRIES: WorkerEntry[] = [
  {
    matches: /(^|\/)jest\.worker$/,
    packageName: '@teambit/jest',
    sourcePath: 'dist/jest.worker.js',
    outPath: 'workers/jest.worker.js',
  },
];
