import { Component } from '@teambit/component';

export type AspectDefinitionProps = {
  id?: string;
  component?: Component;
  aspectPath: string;
  runtimePath: string | null;
  aspectFilePath: string | null;
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

  static from({ component, aspectPath, aspectFilePath, runtimePath, id }: AspectDefinitionProps) {
    return new AspectDefinition(aspectPath, aspectFilePath, runtimePath, component, id);
  }
}
