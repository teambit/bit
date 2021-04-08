import decamelize from 'decamelize';
import * as path from 'path';
import * as semver from 'semver';
import { is, head, tail } from 'ramda';
import { versionParser, isHash, LATEST_VERSION } from '@teambit/component-version';
import isValidIdChunk from './utils/is-valid-id-chunk';
import isValidScopeName from './utils/is-valid-scope-name';
import { InvalidBitId, InvalidIdChunk, InvalidName, InvalidScopeName } from './exceptions';

type BitIdProps = {
  scope?: string | null | undefined;
  box?: string | undefined;
  name: string;
  version?: string | undefined;
};

export type BitIdStr = string;

export const VERSION_DELIMITER = '@';

export default class BitId {
  readonly scope: string | null | undefined;
  readonly box: string | undefined;
  readonly name: string;
  readonly version: string | undefined;

  constructor({ scope, box, name, version }: BitIdProps) {
    // don't validate the id parts using isValidIdChunk here. we instance this class tons of times
    // and running regex so many times impact the performance
    if (!name) throw new InvalidName(name);
    this.scope = scope || null;
    this.box = undefined;
    this.name = box ? `${box}/${name}` : name;
    this.version = version || undefined;
    Object.freeze(this);
  }

  clone(): BitId {
    return new BitId(this);
  }

  changeScope(newScope?: string | null | undefined): BitId {
    return new BitId({ scope: newScope, name: this.name, version: this.version });
  }

  changeVersion(newVersion: string | undefined): BitId {
    return new BitId({ scope: this.scope, name: this.name, version: newVersion });
  }

  isLocal(scopeName?: string): boolean {
    return !this.scope || Boolean(scopeName && scopeName === this.scope);
  }

  getVersion() {
    return versionParser(this.version);
  }

  hasVersion(): boolean {
    return Boolean(this.version && this.version !== LATEST_VERSION);
  }

  hasScope(): boolean {
    return Boolean(this.scope);
  }

  hasSameName(id: BitId): boolean {
    return this.name === id.name;
  }

  hasSameScope(id: BitId): boolean {
    if (this.hasScope() && id.hasScope()) return this.scope === id.scope;
    if (!this.hasScope() && !id.hasScope()) return true;
    return false; // one has scope but not the other
  }

  hasSameVersion(id: BitId): boolean {
    if (this.hasVersion() && id.hasVersion()) return this.version === id.version;
    if (!this.hasVersion() && !id.hasVersion()) return true;
    return false; // one has version but not the other
  }

  toString(ignoreScope = false, ignoreVersion = false): BitIdStr {
    const { name, version } = this;
    const scope = this.scope;
    const componentStr = ignoreScope || !scope ? name : [scope, name].join('/');
    // when there is no scope and the version is latest, omit the version.
    if (ignoreVersion || !this.hasVersion()) return componentStr;
    // $FlowFixMe version here is a string because this.hasVersion() is true
    return componentStr.concat(`${VERSION_DELIMITER}${version}`);
  }

  toStringWithoutScope(): BitIdStr {
    return this.toString(true);
  }

  toStringWithoutVersion(): BitIdStr {
    return this.toString(false, true);
  }

  toStringWithoutScopeAndVersion(): BitIdStr {
    return this.toString(true, true);
  }

  isEqual(bitId: BitId): boolean {
    return this.hasSameName(bitId) && this.hasSameScope(bitId) && this.hasSameVersion(bitId);
  }

  isEqualWithoutVersion(bitId: BitId): boolean {
    return this.hasSameName(bitId) && this.hasSameScope(bitId);
  }

  isEqualWithoutScopeAndVersion(bitId: BitId): boolean {
    return this.hasSameName(bitId);
  }

  serialize() {
    const obj = { scope: this.scope, name: this.name, version: this.version };
    if (!this.hasVersion()) delete obj.version;
    if (!this.hasScope()) delete obj.scope;
    return obj;
  }

  toFullPath(): string {
    if (!this.scope || !this.version) {
      throw new Error('BitId.toFullPath is unable to generate a path without a scope or a version');
    }
    return path.join(this.name, this.scope, this.version);
  }

  isVersionSnap() {
    return isHash(this.version);
  }

  /**
   * Get a string id and return a string without the version part
   * @param {string} id
   * @return {string} id - id without version
   */
  static getStringWithoutVersion(id: string): string {
    const splitted = id.split(VERSION_DELIMITER);
    let res = splitted[0];
    // the delimiter is @. now with the new owner prefix
    // many times the id starts with the @ sign as part of the @owner prefix
    // do not treat this @ at the beginning as the version delimiter
    if (id.startsWith(VERSION_DELIMITER)) {
      res = `${VERSION_DELIMITER}${splitted[1]}`;
    }
    return res;
  }

  static getVersionOnlyFromString(id: string): string {
    return id.split(VERSION_DELIMITER)[1];
  }

  static parse(id: BitIdStr, hasScope = true, version: string = LATEST_VERSION): BitId {
    if (!is(String, id)) {
      throw new TypeError(`BitId.parse expects to get "id" as a string, instead, got ${typeof id}`);
    }

    if (id.includes(VERSION_DELIMITER) && id.lastIndexOf(VERSION_DELIMITER) > 0) {
      const [newId, newVersion] = id.split(VERSION_DELIMITER);
      id = newId;
      version = newVersion;
    }

    const getScopeAndName = () => {
      if (hasScope) {
        return BitId.getScopeAndName(id);
      }

      return {
        scope: undefined,
        name: id,
      };
    };
    const { scope, name } = getScopeAndName();

    if (!isValidIdChunk(name)) throw new InvalidName(name);
    if (scope && !isValidScopeName(scope)) {
      throw new InvalidScopeName(scope, id);
    }

    return new BitId({
      scope,
      name,
      version,
    });
  }

  static getScopeAndName(id: string) {
    const delimiterIndex = id.indexOf('/');
    if (delimiterIndex < 0) throw new InvalidBitId(id);
    const scope = id.substring(0, delimiterIndex);
    const name = id.substring(delimiterIndex + 1);
    return {
      scope,
      name,
    };
  }

  static parseObsolete(id: BitIdStr, version: string = LATEST_VERSION): BitId {
    if (id.includes(VERSION_DELIMITER)) {
      const [newId, newVersion] = id.split(VERSION_DELIMITER);
      id = newId;
      version = newVersion;
    }

    const idSplit = id.split('/');
    if (idSplit.length === 3) {
      const [scope, box, name] = idSplit;
      if (!isValidIdChunk(name, false) || !isValidIdChunk(box, false) || !isValidScopeName(scope)) {
        throw new InvalidIdChunk(`${scope}/${box}/${name}`);
      }
      // $FlowFixMe (in this case the realScopeName is not undefined)
      return new BitId({
        scope,
        box,
        name,
        version,
      });
    }

    if (idSplit.length === 2) {
      const [box, name] = idSplit;
      if (!isValidIdChunk(name, false) || !isValidIdChunk(box, false)) {
        throw new InvalidIdChunk(`${box}/${name}`);
      }
      return new BitId({
        box,
        name,
        version,
      });
    }

    if (idSplit.length === 1) {
      const [name] = idSplit;
      if (!isValidIdChunk(name)) {
        throw new InvalidIdChunk(name);
      }
      return new BitId({
        name,
        version,
      });
    }

    throw new InvalidBitId(id);
  }

  /**
   * before version 13.0.3 bitmap and component-dependencies ids were written as strings (e.g. scope/box/name@version)
   * since that version the ids are written as objects ({ scope: scopeName, name: compName, version: 0.0.1 })
   */
  static parseBackwardCompatible(id: string | BitIdProps): BitId {
    return typeof id === 'string' ? BitId.parseObsolete(id) : new BitId(id);
  }

  static getValidScopeName(scope: string) {
    const suggestedName = scope.toLowerCase();
    let cleanName = suggestedName
      .split('')
      .map((char) => {
        if (/^[$\-_!.a-z0-9]+$/.test(char)) return char;
        return '';
      })
      .join('');

    // allow only one dot
    const nameSplitByDot = cleanName.split('.');
    if (nameSplitByDot.length > 1) {
      cleanName = `${head(nameSplitByDot)}.${tail(nameSplitByDot).join('')}`;
    }

    if (!cleanName) {
      // @todo: change it to BitError
      throw new Error('scope name created by directory name have to contains at least one character or number');
    }
    return cleanName;
  }

  static getValidIdChunk(chunk: string): string {
    if (!isValidIdChunk(chunk)) {
      chunk = chunk.replace(/\./g, ''); // remove "."
      chunk = chunk.replace(/ /g, '-'); // replace a space with a dash.
      chunk = decamelize(chunk, '-');
    }
    return chunk;
  }

  static getValidBitId(box: string | undefined, name: string): BitId {
    return new BitId({ name: BitId.getValidIdChunk(name), box: box ? BitId.getValidIdChunk(box) : undefined });
  }

  static isValidVersion(version: string): boolean {
    // a version can be a tag (semver) or a snap (hash)
    return BitId.isValidSemver(version) || isHash(version);
  }

  static isValidSemver(version: string): boolean {
    return Boolean(semver.valid(version));
  }
}
