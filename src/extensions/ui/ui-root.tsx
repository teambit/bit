import { Component, ComponentID } from '../component';
import { GetBitMapComponentOptions } from '../../consumer/bit-map/bit-map';
import { PathOsBased } from '../../utils/path';

export interface UIRoot {
  /**
   * unique name of the ui.
   */
  name: string;

  /**
   * path of the ui root.
   */
  path: string;

  /**
   * paths for all extensions to load.
   */
  extensionsPaths: string[];

  /**
   * resolve components from a given pattern.
   */
  resolvePattern(pattern: string): Promise<Component[]>;

  /**
   * listener for when the dev server starts. can be used for running the watcher.
   */
  onStart?(): void;

  componentDir(
    componentId: ComponentID,
    bitMapOptions?: GetBitMapComponentOptions,
    options?: { relative: boolean }
  ): PathOsBased | undefined;
}
