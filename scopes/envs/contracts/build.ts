import type { LaneId } from '@teambit/lane-id';
import type { Component } from './component';
import type { Network } from './capsule';
import type { EnvHandler } from './env-handler';
import type { ExecutionContext } from './execution-context';
import type { Pipeline } from './pipeline';

/**
 * a folder to write artifacts generated during a build task.
 * excluded by default from the package tar file.
 */
export const CAPSULE_ARTIFACTS_DIR = 'artifacts';

export type TaskLocation = 'start' | 'end';

export type PipeName = 'build' | 'tag' | 'snap';

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
};

export type ComponentResult = {
  component: Component;

  /**
   * metadata generated during component build.
   * this eventually gets saved into `aspectsData` prop of the builder aspect data.
   * it can be retrieved later on by `builder.getDataByAspect()` method.
   */
  metadata?: { [key: string]: any };

  /**
   * returning errors fails the pipeline.
   */
  errors?: Array<Error | string>;

  warnings?: string[];

  /**
   * timestamp in milliseconds when the task started.
   */
  startTime?: number;

  /**
   * timestamp in milliseconds when the task ended.
   */
  endTime?: number;

  /**
   * "pending" means the task was skipped because a dependency failed.
   */
  status?: 'pending';
};

export interface BuiltTaskResult {
  /**
   * build results for each of the components in the build context.
   */
  componentsResults: ComponentResult[];

  /**
   * artifacts to generate after a successful build.
   */
  artifacts?: ArtifactDefinition[];
}

export type TaskResults = {
  task: BuildTask;
  componentsResults: ComponentResult[];
  startTime: number;
  endTime: number;
};

export interface TaskResultsList {
  tasksResults: TaskResults[];
}

export interface BuildContext extends ExecutionContext {
  /**
   * network of capsules ready to be built.
   */
  capsuleNetwork: Network;

  /**
   * results of the tasks that ran before this task.
   */
  previousTasksResults: TaskResults[];

  /**
   * whether the build runs in dev mode.
   */
  dev?: boolean;

  /**
   * the pipeline being executed.
   */
  pipeName: PipeName;

  /**
   * current lane-id. empty when on main.
   */
  laneId?: LaneId;
}

export interface BuildTask {
  /**
   * aspect id of the creator of the task.
   */
  aspectId: string;

  /**
   * name of the task, in UpperCamelCase. unique among the tasks of the same aspectId.
   */
  name: string;

  description?: string;

  /**
   * whether the task runs before or after the env pipeline.
   */
  location?: TaskLocation;

  execute(context: BuildContext): Promise<BuiltTaskResult>;

  /**
   * runs before the build pipeline starts, for all envs.
   */
  preBuild?(context: BuildContext): Promise<void>;

  /**
   * runs after the build pipeline completes for all envs.
   */
  postBuild?(context: BuildContext, tasksResults: TaskResultsList): Promise<void>;

  /**
   * tasks this task depends on, as "aspectId" or "aspectId:name".
   */
  dependencies?: string[];
}

/**
 * a task as an env defines it. Bit adds the aspectId when it computes the pipeline.
 */
export type Task = Pick<BuildTask, 'name' | 'description' | 'execute' | 'preBuild' | 'postBuild' | 'dependencies'>;

export type TaskHandler = {
  handler: EnvHandler<Task>;
  name: string;
};

export interface BuilderEnv {
  build(): Pipeline;
  snap(): Pipeline;
  tag(): Pipeline;
}
