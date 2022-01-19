import { Component } from '@teambit/component';
import { Capsule } from '@teambit/isolator';
import { BuildContext } from '@teambit/builder';

export interface AppBuildContext extends BuildContext {
  capsule: Capsule;

  appComponent: Component;
}
