import type { ComponentID } from '@teambit/component-id';

/**
 * a file of a component.
 */
export interface ComponentSourceFile {
  /**
   * absolute path of the file.
   */
  path: string;

  /**
   * path of the file relative to the component directory.
   */
  relative: string;

  /**
   * the component directory.
   */
  base: string;

  contents: Buffer;
}

export type ComponentDependencyEntry = {
  id: string;
  version: string;
  type: string;
  lifecycle: string;
  source?: string;
  hidden?: boolean;
  optional?: boolean;
  getPackageName?: () => string;
};

export interface ComponentDependencyList {
  readonly dependencies: ComponentDependencyEntry[];
  forEach(predicate: (dep: ComponentDependencyEntry, index?: number) => void): void;
  map(predicate: (dep: ComponentDependencyEntry, index?: number) => any): any[];
}

/**
 * the parts of a Bit component that envs and their services use.
 */
export interface Component {
  readonly id: ComponentID;

  readonly filesystem: {
    readonly files: ComponentSourceFile[];
  };

  getDependencies(): ComponentDependencyList;
}
