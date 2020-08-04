import { BitId } from '../../bit-id';

export class ComponentID {
  constructor(
    /**
     * legacy bit component id
     */
    // private legacyComponentId: BitId
    public legacyComponentId: BitId
  ) {}

  /**
   * An access to the legacy id. DO NOT USE THIS
   *
   * @readonly
   * @memberof ComponentID
   */
  get _legacy() {
    return this.legacyComponentId;
  }

  /**
   * resolves the version of the component ID.
   */
  get version() {
    return this.legacyComponentId.version;
  }

  get namespace() {
    const arr = this.legacyComponentId.name.split('/');
    return arr.splice(-1, 1).join('/');
  }

  /**
   * retrieves the full name of the component including its namespace.
   */
  get fullName() {
    return this._legacy.name;
  }

  /**
   * resolves the name of the component.
   */
  get name() {
    const arr = this.legacyComponentId.name.split('/');
    return arr[arr.length - 1];
  }

  isEqual(id: ComponentID): boolean {
    return this._legacy.isEqual(id._legacy);
  }

  /**
   * serialize the component ID.
   */
  toString() {
    return this.legacyComponentId.toString();
  }

  toObject() {
    return this.legacyComponentId.serialize();
  }

  /**
   * generate a component ID from a string.
   */
  static fromString(idStr: string, hasScope?: boolean) {
    return new ComponentID(BitId.parse(idStr, hasScope));
  }

  static fromObject(object: any) {
    return ComponentID.fromLegacy(new BitId(object));
  }

  /**
   * create a `ComponentID` instance from the legacy `BitId`.
   */
  static fromLegacy(legacyId: BitId) {
    return new ComponentID(legacyId);
  }
}
