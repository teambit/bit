import { BitId } from 'bit-bin/dist/bit-id';
import { MissingScope } from './exceptions';

export class ComponentID {
  constructor(
    /**
     * legacy bit component id
     */
    private legacyComponentId: BitId,

    readonly _scope?: string
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
   * determine whether ID has a version.
   */
  hasVersion() {
    return this._legacy.hasVersion();
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

  /**
   * return the scope if included in the ID.
   */
  get scope() {
    const scope = this._legacy.scope;
    if (scope) return scope;
    return this._scope;
  }

  /**
   * get a new component ID instance with given scope.
   */
  changeScope(scopeName: string): ComponentID {
    const legacyId = this._legacy.changeScope(scopeName);
    return ComponentID.fromLegacy(legacyId);
  }

  isEqual(id: ComponentID, opts: { ignoreVersion?: boolean } = {}): boolean {
    const result = id.scope === this.scope && id.toString() === this.toString();
    if (!opts.ignoreVersion) {
      return result && this.version === id.version;
    }
    return result;
  }

  /**
   * serialize the component ID.
   */
  toString(opts: { ignoreVersion?: boolean } = {}) {
    let id = this._legacy;
    if (this._scope && !this._legacy.scope) {
      id = id.changeScope(this._scope);
    }
    return id.toString(false, opts.ignoreVersion);
  }

  toObject() {
    const object = this.legacyComponentId.serialize();
    if (!object.scope) {
      object.scope = this.scope;
    }

    return object;
  }

  /**
   * generate a component ID from a string.
   */
  static fromString(idStr: string, scope?: string) {
    const legacyId = BitId.parse(idStr, true);
    if (!scope && !legacyId.scope) throw new MissingScope(idStr);
    return new ComponentID(legacyId, scope);
  }

  /**
   * @deprecated
   * please make sure not to use this function. it is deprecated and its usage is forbidden
   * and could potentially cause many different bugs across the system.
   */
  static fromLegacyString(idStr: string, scope?: string) {
    const legacyId = BitId.parse(idStr, false);
    return new ComponentID(legacyId, scope);
  }

  static fromObject(object: any, scope?: string) {
    return ComponentID.fromLegacy(new BitId(object), scope);
  }

  /**
   * create a `ComponentID` instance from the legacy `BitId`.
   */
  static fromLegacy(legacyId: BitId, scope?: string) {
    if (!scope && !legacyId.scope) throw new MissingScope(legacyId);
    return new ComponentID(legacyId, scope);
  }
}
