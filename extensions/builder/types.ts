import { Component } from '@teambit/component';

export type Serializable = {
  toString(): string;
};

export type TaskMetadata = { [key: string]: Serializable };

export type ComponentResult = {
  /**
   * instance of the component
   */
  component: Component;

  /**
   * metadata generated during component build.
   */
  metadata?: TaskMetadata;

  /**
   * returning errors from build tasks will cause a pipeline failure and logs all returned errors.
   */
  errors?: Array<Error | string>;

  /**
   * warnings generated throughout the build task.
   */
  warnings?: string[];

  /**
   * timestamp in milliseconds when the task started
   */
  startTime?: number;

  /**
   * timestamp in milliseconds when the task ended
   */
  endTime?: number;
};
