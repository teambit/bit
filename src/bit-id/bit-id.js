/** @flow */
import path from 'path';
import semver from 'semver';
import decamelize from 'decamelize';
import R from 'ramda';
import Version from '../version';
import { InvalidBitId, InvalidIdChunk } from './exceptions';
import { LATEST_BIT_VERSION, VERSION_DELIMITER, NO_PLUGIN_TYPE } from '../constants';
import { isValidIdChunk, isValidScopeName } from '../utils';
import type { PathOsBased } from '../utils/path';
import GeneralError from '../error/general-error';

export type BitIdProps = {
  scope?: string,
  box?: string,
  name: string,
  version?: ?string
};

export type BitIdStr = string;

export default class BitId {
  scope: ?string;
  box: string;
  name: string;
  version: ?string;

  constructor({ scope, box, name, version }: BitIdProps) {
    this.scope = scope || null;
    this.box = box || 'global';
    this.name = name;
    this.version = version || null;
  }

  clone(): BitId {
    return new BitId(this);
  }

  changeScope(newScope: string): BitId {
    return new BitId({ scope: newScope, box: this.box, name: this.name, version: this.version });
  }

  isLocal(scopeName: string) {
    return !this.scope || scopeName === this.scope;
  }

  getVersion() {
    return Version.parse(this.version);
  }

  hasVersion() {
    return this.version && this.version !== LATEST_BIT_VERSION;
  }

  toString(ignoreScope: boolean = false, ignoreVersion: boolean = false): BitIdStr {
    const { name, box, version } = this;
    const scope = this.scope;
    const componentStr = ignoreScope || !scope ? [box, name].join('/') : [scope, box, name].join('/');
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

  toObject() {
    const key = this.scope ? [this.scope, this.box, this.name].join('/') : [this.box, this.name].join('/');
    const value = this.version;

    return { [key]: value };
  }

  toFullPath(): PathOsBased {
    return path.join(this.box, this.name, this.scope, this.version);
  }

  /**
   * Get a string id and return a string without the version part
   * @param {string} id
   * @return {string} id - id without version
   */
  static getStringWithoutVersion(id: string): string {
    return id.split(VERSION_DELIMITER)[0];
  }

  static getVersionOnlyFromString(id: string): string {
    return id.split(VERSION_DELIMITER)[1];
  }

  static parse(id: ?string, version: string = LATEST_BIT_VERSION): ?BitId {
    if (!id || id === NO_PLUGIN_TYPE) {
      return null;
    }
    if (id.includes(VERSION_DELIMITER)) {
      const [newId, newVersion] = id.split(VERSION_DELIMITER);
      id = newId;
      version = newVersion;
    }

    const idSplit = id.split('/');
    if (idSplit.length === 3) {
      const [scope, box, name] = idSplit;
      if (!isValidIdChunk(name) || !isValidIdChunk(box) || !isValidScopeName(scope)) {
        // $FlowFixMe
        throw new InvalidIdChunk(`${scope}/${box}/${name}`);
      }
      // $FlowFixMe (in this case the realScopeName is not null)
      return new BitId({
        scope,
        box,
        name,
        version
      });
    }

    if (idSplit.length === 2) {
      const [box, name] = idSplit;
      if (!isValidIdChunk(name) || !isValidIdChunk(box)) {
        // $FlowFixMe
        throw new InvalidIdChunk(`${box}/${name}`);
      }
      // $FlowFixMe
      return new BitId({
        box,
        name,
        version
      });
    }

    if (idSplit.length === 1) {
      const [name] = idSplit;
      if (!isValidIdChunk(name)) {
        // $FlowFixMe
        throw new InvalidIdChunk(name);
      }
      // $FlowFixMe
      return new BitId({
        name,
        version
      });
    }

    throw new InvalidBitId();
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
      cleanName = `${R.head(nameSplitByDot)}.${R.tail(nameSplitByDot).join('')}`;
    }

    if (!cleanName) {
      throw new GeneralError('scope name created by directory name have to contains at least one character or number');
    }
    return cleanName;
  }

  static getValidBitId(box: string, name: string): BitId {
    const getValidIdChunk = (chunk) => {
      if (!isValidIdChunk(chunk)) {
        chunk = chunk.replace(/\./g, '');
        chunk = decamelize(chunk, '-');
      }
      return chunk;
    };

    return new BitId({ name: getValidIdChunk(name), box: getValidIdChunk(box) });
  }

  static isValidVersion(version: string): boolean {
    return semver.valid(version);
  }
}
