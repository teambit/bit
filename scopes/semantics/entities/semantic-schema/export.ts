type Primitive = string | number | boolean | null | undefined;
export type StaticProperties = Map<string, Primitive>;

/**
 * @todo: this was implemented before all other schemas and is used only for composition.
 * it needs to be align with other schemas.
 */
export class Export {
  constructor(
    /**
     * named export identifier of the module export.
     */
    readonly identifier: string,

    /**
     * static properties attached to this export
     * @example
     * export hello = () => {};
     * hello.value = "text"; // <-- staticProperty
     * hello.count = 3; // <-- static property
     */
    readonly staticProperties?: StaticProperties
  ) {}

  toObject() {
    return {
      constructorName: this.constructor.name,
      identifier: this.identifier,
    };
  }
}
