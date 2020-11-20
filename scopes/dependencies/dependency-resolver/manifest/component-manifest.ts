import { Component } from '@teambit/component';
import { SemVer } from 'semver';

import { Manifest, ManifestDependenciesObject } from './manifest';

export class ComponentManifest extends Manifest {
  constructor(
    public name: string,
    public version: SemVer,
    public dependencies: ManifestDependenciesObject,
    public component: Component
  ) {
    super(name, version, dependencies);
  }

  // get dir() {
  //   // TODO: take the dir from the component
  // }
}
