import type { ArtifactStorageResolver } from '..';

export type ArtifactDefinition = {
  /**
   * name of the artifact.
   * e.g. a project might utilize two different artifacts for the same typescript compiler, one
   * that generates ES5 files and another for ES6, this prop helps to distinguish between the two.
   */
  name: string;

  /**
   * aspect id that created the artifact. sometimes it's not the same as the task.id.
   * e.g. teambit.compilation/compiler executes teambit.typescript/typescript code that generates dists artifacts
   * the generatedBy in this case is the teambit.typescript/typescript while the task.id is
   * teambit.compilation/compiler
   */
  generatedBy?: string;

  /**
   * description of the artifact.
   */
  description?: string;

  /**
   * glob patterns of files to include upon artifact creation.
   * examples:
   * ['*.ts', '!foo.ts'] - matches all ts files but ignores foo.ts.
   * ['dist'] - matches all files recursively from dist dir. (similar to 'dist/**').
   *
   * the glob array are passed to [globby](https://www.npmjs.com/package/globby), which interprets the patterns
   * according to [minimatch](https://github.com/isaacs/minimatch#usage).
   */
  globPatterns?: string[];

  /**
   * @deprecated use globPatterns instead.
   *
   * directories of files to include upon artifact creation. minimatch is used to match the patterns.
   * e.g. ['/tmp'] will include all files from tmp dir
   */
  directories?: string[];

  /**
   * @deprecated use globPatterns instead.
   *
   * define the root directory for reading the artifacts from the capsule file system.
   * the rootDir must be unique per artifacts, otherwise we risk overriding data between artifacts.
   */
  rootDir?: string;

  /**
   * @deprecated use globPatterns instead.
   *
   * adds a directory prefix for all artifact files.
   */
  dirPrefix?: string;

  /**
   * determine the context of the artifact.
   * default artifact context is `component`.
   * "env" is useful when the same file is generated for all components, for example, "preview"
   * task may create the same webpack file for all components of that env.
   */
  context?: 'component' | 'env';

  /**
   * storage resolver. can be used to replace where artifacts are stored.
   * default resolver persists artifacts on scope. (not recommended for large files!)
   */
  storageResolver?: ArtifactStorageResolver;
};

export type ArtifactModelDefinition = Omit<ArtifactDefinition, 'storageResolver'> & {
  storageResolver?: string;
};
