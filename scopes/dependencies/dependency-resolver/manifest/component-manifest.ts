import type { Component } from '@teambit/component';
import type { SemVer } from 'semver';
import type { EnvPolicy } from '../policy/env-policy';

import type { ManifestDependenciesObject } from './manifest';
import { Manifest } from './manifest';

export class ComponentManifest extends Manifest {
  constructor(
    public name: string,
    public version: SemVer,
    public dependencies: ManifestDependenciesObject,
    public component: Component,
    public envPolicy: EnvPolicy
  ) {
    super(name, version, dependencies);
  }

  // get dir() {
  //   // TODO: take the dir from the component
  // }
}
