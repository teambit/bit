import { SemVer } from 'semver';
import { Manifest } from './manifest';
import { DependenciesObjectDefinition } from '../types';
import { Component } from '../../component';

export class ComponentManifest extends Manifest {
  constructor(
    public name: string,
    public version: SemVer,
    public dependencies: DependenciesObjectDefinition,
    public component: Component
  ) {
    super(name, version, dependencies);
  }

  // get dir() {
  //   // TODO: take the dir from the component
  // }
}
