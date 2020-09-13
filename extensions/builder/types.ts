import { Component } from '@teambit/component';

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
   * returning errors from build tasks will cause a pipeline failure and logs all returned errors.
   */
  errors?: Array<Error | string>;

  /**
   * warnings generated throughout the build task.
   */
  warning?: string[];
};
