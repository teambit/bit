import { relative } from 'path';
import { Component } from '@teambit/component';
import { getCoreAspectPackageName } from './core-aspects';

export type AspectDefinitionProps = {
  id?: string;
  component?: Component;
  aspectPath: string;
  runtimePath: string | null;
  aspectFilePath: string | null;
  local?: boolean;
};

export class AspectDefinition {
  constructor(
    /**
     * path to the root directory of the aspect module.
     */
    readonly aspectPath: string,

    /**
     * path to the aspect file (.aspect).
     */
    readonly aspectFilePath: string | null,

    /**
     * path to the runtime entry
     */
    readonly runtimePath: string | null,
    /**
     * aspect component
     */
    readonly component?: Component,
    /**
     * id of the component (used instead of component in the case of core aspect)
     */
    readonly id?: string,
    /**
     * aspect defined using 'file://' protocol
     */
    readonly local?: boolean
  ) {}

  get getId() {
    if (this.component) return this.component.id.toString();
    if (this.id) return this.id;
    return null;
  }

  get packageName() {
    return this.getId ? getCoreAspectPackageName(this.getId) : null;
  }

  get aspectFilePackagePath() {
    if (!this.packageName) return null;
    if (!this.aspectFilePath) return null;
    return `${this.packageName}/${relative(this.aspectPath, this.aspectFilePath)}`;
  }

  get runtimePathPackagePath() {
    if (!this.packageName) return null;
    if (!this.runtimePath) return null;
    return `${this.packageName}/${relative(this.aspectPath, this.runtimePath)}`;
  }

  static from({ component, aspectPath, aspectFilePath, runtimePath, id, local }: AspectDefinitionProps) {
    return new AspectDefinition(aspectPath, aspectFilePath, runtimePath, component, id, local);
  }
}
