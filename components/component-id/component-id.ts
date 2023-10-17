import { BitId } from '@teambit/legacy-bit-id';
import { MissingScope } from './exceptions';

/**
 * serialized component id.
 */
export type ComponentIdObj = {
  name: string;
  scope: string;
  version?: string;
};

type EqualityOption = { ignoreVersion?: boolean };

export class ComponentID {
  constructor(
    /**
     * legacy bit component id
     */
    private legacyComponentId: BitId,

    readonly _scope?: string
  ) {
    if (!legacyComponentId.name)
      throw new Error(`ComponentID expects to get an object with "name" prop. got ${legacyComponentId}`);
    if (legacyComponentId.constructor.name !== BitId.name)
      throw new Error(`ComponentID expects to get BitId instance. got ${legacyComponentId.constructor.name}`);
    if (!_scope && !legacyComponentId.scope) throw new MissingScope(legacyComponentId);
  }

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
    return arr.slice(0, -1).join('/');
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
  get scope(): string {
    const scope = this._legacy.scope;
    if (scope) return scope;
    if (!this._scope) throw new Error('scope cannot be undefined');
    return this._scope;
  }

  /**
   * get a new component ID instance with given scope.
   * in case "undefined"/"null" is passed, the current scope becomes defaultScope
   */
  changeScope(scopeName: string): ComponentID {
    const legacyId = this._legacy.changeScope(scopeName);
    return ComponentID.fromLegacy(legacyId, this.scope);
  }

  changeVersion(version: string | undefined) {
    const legacyId = this._legacy.changeVersion(version);
    return ComponentID.fromLegacy(legacyId, this.scope);
  }

  isEqual(id: ComponentID, opts?: EqualityOption): boolean {
    return ComponentID.isEqual(this, id, opts);
  }

  isEqualWithoutVersion(id: ComponentID): boolean {
    return this.isEqual(id, { ignoreVersion: true });
  }

  isLocal(scopeName?: string): boolean {
    return this._legacy.isLocal(scopeName);
  }

  /**
   * do not trust this data to determine whether a component is exported to a remote or not.
   * use workspace.isExported() or scope.isExported() instead.
   */
  hasScope(): Boolean {
    return this._legacy.hasScope();
  }

  serialize(): ComponentIdObj {
    return this.toObject();
  }

  static deserialize(id: ComponentIdObj) {
    return ComponentID.fromObject(id);
  }

  static isValidVersion(version: string): boolean {
    return BitId.isValidVersion(version);
  }

  /**
   * examples:
   * 1.0.0 => null
   * 1.0.0-dev.1 => ['dev', 1]
   * 1.0.0-dev.1.alpha.2 => ['dev', 1, 'alpha', 2]
   * 1.0.0-0 => [0]
   */
  getVersionPreReleaseData(): null | readonly string[] {
    return this._legacy.getVersionPreReleaseData();
  }

  /**
   * serialize a component ID without its version.
   */
  toStringWithoutVersion() {
    let id = this._legacy;
    if (this._scope && !this._legacy.scope) {
      id = id.changeScope(this._scope);
    }

    return id.toStringWithoutVersion();
  }

  hasSameVersion(id: ComponentID) {
    return this._legacy.hasSameVersion(id._legacy);
  }

  /**
   * serialize the component ID.
   */
  toString(opts: { ignoreVersion?: boolean; fsCompatible?: boolean } = {}) {
    let id = this._legacy;
    if (this._scope && !this._legacy.scope) {
      id = id.changeScope(this._scope);
    }

    const idStr = id.toString(false, opts.ignoreVersion);
    if (opts.fsCompatible) return idStr.replace(/\//g, '_').replace(/\./g, '_').replace(/-/g, '_');
    return idStr;
  }

  toObject() {
    const object = this.legacyComponentId.serialize();
    if (!object.scope) {
      object.scope = this.scope;
    }

    // TODO - TS does not realize object.scope now has a value
    return object as ComponentIdObj;
  }

  clone() {
    return ComponentID.fromLegacy(this._legacy.clone(), this._scope);
  }

  /**
   * generate a component ID from a string. Returns undefined if input is malformed
   */
  static tryFromString(idStr: string, scope?: string) {
    try {
      return ComponentID.fromString(idStr, scope);
    } catch {
      return undefined;
    }
  }

  /**
   * generate a component ID from a string.
   */
  static fromString(idStr: string, scope?: string): ComponentID {
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

  // overload when providing scope separaetly, e.g. `fromObject({ name: 'button' }, 'teambit.base-ui')`
  static fromObject(object: Omit<ComponentIdObj, 'scope'>, scope: string): ComponentID;
  static fromObject(object: ComponentIdObj, scope?: string): ComponentID;
  /** deserialize a componnet id from raw object */
  static fromObject(object: ComponentIdObj, scope?: string) {
    return ComponentID.fromLegacy(new BitId(object), scope);
  }

  /**
   * check if object can be correctly deserialized to be a ComponentID
   */
  static isValidObject(o: any): o is ComponentIdObj {
    return typeof o === 'object' && typeof o.name === 'string' && typeof o.scope === 'string';
    // consider validating values with regex
  }

  static isEqual(a: ComponentID | undefined, b: ComponentID | undefined, opts: EqualityOption = {}): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;

    const result =
      a.scope === b.scope &&
      a.toString({ ignoreVersion: opts.ignoreVersion }) === b.toString({ ignoreVersion: opts.ignoreVersion });
    if (opts.ignoreVersion) {
      return result;
    }
    return result && a.hasSameVersion(b);
  }

  static isEqualObj(a: ComponentIdObj | undefined, b: ComponentIdObj | undefined, opts: EqualityOption = {}): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;

    let result = a.scope === b.scope && a.name === b.name;

    if (!opts.ignoreVersion) {
      result = result && a.version === b.version;
    }

    return result;
  }

  /**
   * create a `ComponentID` instance from the legacy `BitId`.
   */
  static fromLegacy(legacyId: BitId, scope?: string) {
    if (!scope && !legacyId.scope) throw new MissingScope(legacyId);
    return new ComponentID(legacyId, scope);
  }

  static sortIds(ids: ComponentID[]) {
    return ids.sort((a, b) => a.toString().localeCompare(b.toString()));
  }
}
