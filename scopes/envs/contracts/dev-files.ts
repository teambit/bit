import type { Component } from './component';

/**
 * the dev files of a component (tests, compositions, docs, ...), grouped by the aspect that defines them.
 */
export interface DevFiles {
  /**
   * get all dev files of an aspect (for example: teambit.defender/tester)
   */
  get(aspectId: string): string[];

  /**
   * list all dev files.
   */
  list(): string[];

  /**
   * determine whether a file is included in the dev files.
   */
  includes(filePath: string): boolean;
}

/**
 * the part of the dev-files aspect that envs use. get it with
 * `context.getAspect<DevFilesMain>(DEV_FILES_ASPECT_ID)`.
 */
export interface DevFilesMain {
  /**
   * get the dev files of a component.
   */
  getDevFiles(component: Component): DevFiles;
}
