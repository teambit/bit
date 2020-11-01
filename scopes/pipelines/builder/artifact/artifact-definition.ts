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
   * glob patterns of files to include upon artifact creation. minimatch is used to match the patterns.
   * e.g. ['*.ts', '!foo.ts'] matches all ts files but ignores foo.ts.
   */
  globPatterns: string[];

  /**
   * define the root directory for reading the artifacts from the capsule file system.
   * the rootDir must be unique per artifacts, otherwise we risk overriding data between artifacts.
   */
  rootDir?: string;

  /**
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
  storageResolver?: string;
};
