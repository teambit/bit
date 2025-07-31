import type { Component } from '@teambit/component';

export type TaskMetadata = { [key: string]: any };

export type ComponentResult = {
  /**
   * instance of the component
   */
  component: Component;

  /**
   * metadata generated during component build.
   * this eventually gets saved into `aspectsData` prop of the builder aspect data.
   * it can be retrieved later on by `builder.getDataByAspect()` method.
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
