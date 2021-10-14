type Primitive = string | number | boolean | null | undefined;
export type StaticProperties = Map<string, Primitive>;

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
}
