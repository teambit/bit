export class Composition {
  constructor(
    /**
     * identifier of the composition
     */
    readonly identifier: string,
    /**
     * file path in which the composition is contained.
     */
    readonly filepath: string
  ) {}

  get displayName() {
    return this.identifier;
  }
}
