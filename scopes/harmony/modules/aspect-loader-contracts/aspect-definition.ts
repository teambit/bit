/**
 * the component an aspect definition may hold. generic, so this module doesn't depend on the component aspect
 * (`@teambit/aspect-loader` exports it bound to its `Component`).
 */
export type AspectDefinitionComponent = { id: { toString(): string } };

export type AspectDefinitionProps<C extends AspectDefinitionComponent = AspectDefinitionComponent> = {
  id?: string;
  component?: C;
  aspectPath: string;
  runtimePath: string | null;
  aspectFilePath: string | null;
  local?: boolean;
};

export class AspectDefinition<C extends AspectDefinitionComponent = AspectDefinitionComponent> {
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
    readonly component?: C,
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

  static from<C extends AspectDefinitionComponent>({
    component,
    aspectPath,
    aspectFilePath,
    runtimePath,
    id,
    local,
  }: AspectDefinitionProps<C>) {
    return new AspectDefinition(aspectPath, aspectFilePath, runtimePath, component, id, local);
  }
}
