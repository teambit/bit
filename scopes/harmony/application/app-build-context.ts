import { Component } from '@teambit/component';
import { Capsule } from '@teambit/isolator';
import { BuildContext } from '@teambit/builder';

export interface AppBuildContext extends BuildContext {
  /**
   * Application capsule
   */
  capsule: Capsule;
  /**
   * app Component object
   */
  appComponent: Component;
}
