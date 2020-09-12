import { Component, ComponentID } from '@teambit/component';
import { ExecutionContext } from '@teambit/environments';
import { Network } from '@teambit/isolator';

export interface BuildContext extends ExecutionContext {
  /**
   * all components about to be built/tagged.
   */
  components: Component[];

  /**
   * graph of capsules ready to be built.
   */
  capsuleGraph: Network;
}

export type ArtifactDefinition = {
  /**
   *
   */
  name: string;

  /**
   *
   */
  description?: string;

  /**
   *
   */
  globPatterns: string[];

  storageResolver?: string[];
};

export type Artifact = {
  paths: string[];
  name: string;
  description: string;
};

export type StorageResolver = {
  store(artifacts: Artifact[]): Promise<ArtifactRef[]>;
};

export type ArtifactRef = {
  // get(): Promise<>;
};

export type ArtifactProps = {
  dirName?: string;
  fileName?: string;
};

export type Serializable = {
  toString(): string;
};

export type ComponentResult = {
  /**
   * instance of the component
   */
  component: Component;

  /**
   * metadata generated during component build.
   */
  metadata?: { [key: string]: Serializable };

  /**
   * artifacts generated through component build.
   */
  artifacts?: ArtifactDefinition[];

  /**
   * returning errors from build tasks will cause a pipeline failure and logs all returned errors.
   */
  errors: Array<Error | string>;

  /**
   * warnings generated throughout the build task.
   */
  warning?: string[];
};

export interface BuildResults {
  components: ComponentResult[];
  artifacts: ArtifactProps[];
}

export type TaskLocation = 'start' | 'end';

export interface BuildTask {
  /**
   * id of the task.
   */
  id: string;

  /**
   * description of what the task does.
   * if available, the logger will log it show it in the status-line.
   * it's helpful to distinguish multiple tasks of the same extension.
   */
  description?: string;

  /**
   * where to put the task, before the env pipeline or after
   */
  location?: TaskLocation;

  /**
   * execute a task in a build context
   */
  execute(context: BuildContext): Promise<BuildResults>;
}
