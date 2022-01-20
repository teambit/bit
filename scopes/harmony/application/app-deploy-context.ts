import { Component } from '@teambit/component';
import { Capsule } from '@teambit/isolator';
import { BuildContext, ArtifactDefinition } from '@teambit/builder';

export interface AppDeployContext extends BuildContext {
  capsule: Capsule;

  appComponent: Component;

  artifacts?: ArtifactDefinition[];
}
