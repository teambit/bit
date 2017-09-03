/** @flow */
import path from 'path';
import Version from '../version';
import { InvalidBitId, InvalidIdChunk } from './exceptions';
import {
  LATEST_BIT_VERSION,
  VERSION_DELIMITER,
  NO_PLUGIN_TYPE,
} from '../constants';
import { isValidIdChunk, isValidScopeName } from '../utils';

export type BitIdProps = {
  scope?: string;
  box?: string;
  name: string;
  version: string;
};

export default class BitId {
  name: string;
  box: string;
  version: ?string;
  scope: ?string;

  constructor({ scope, box, name, version }: BitIdProps) {
    this.scope = scope || null;
    this.box = box || 'global';
    this.name = name;
    this.version = version || null;
  }

  changeScope(newScope: string) {
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

  toString(ignoreScope: boolean = false, ignoreVersion: boolean = false): string {
    const { name, box, version } = this;
    const scope = this.scope;
    const componentStr = ignoreScope || !scope ? [box, name].join('/') : [scope, box, name].join('/');
    // when there is no scope and the version is latest, omit the version.
    if (ignoreVersion || (!scope && !this.hasVersion())) return componentStr;
    return componentStr.concat(`${VERSION_DELIMITER}${version}`);
  }

  toStringWithoutScope() {
    return this.toString(true);
  }

  toStringWithoutVersion() {
    return this.toString(false, true);
  }

  toStringWithoutScopeAndVersion() {
    return this.toString(true, true);
  }

  toObject() {
    const key = this.scope ? [this.scope, this.box, this.name].join('/') : [this.box, this.name].join('/');
    const value = this.version;

    return { [key]: value };
  }

  toFullPath() {
    return path.join(this.box, this.name, this.scope, this.version);
  }

  static parse(id: ?string, version: string = LATEST_BIT_VERSION): ?BitId {
    if (!id || id === NO_PLUGIN_TYPE) { return null; }
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
      if (!isValidIdChunk(name) || !isValidScopeName(box)) {
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

  static isValidBitId(id: string) {
    var version = '0';
    if (!id || id === NO_PLUGIN_TYPE) { return false; }
    if (id.includes(VERSION_DELIMITER)) {
      const [newId, newVersion] = id.split(VERSION_DELIMITER);
      id = newId;
      version = newVersion;
    }

    const idSplit = id.split('/');
    if (idSplit.length === 3) {
      const [scope, box, name] = idSplit;
      if (!isValidIdChunk(name) || !isValidIdChunk(box) || !isValidScopeName(scope)) return false;
      return true;
    }

    if (idSplit.length === 2) {
      const [box, name] = idSplit;
      if (!isValidIdChunk(name) || !isValidScopeName(box)) return false;
      return true;
    }

    if (idSplit.length === 1) {
      const [name] = idSplit;
      if (!isValidIdChunk(name)) return false;
      return true;
    }

    return false;
  }
  static getValidBitId(box: string, name: string): BitId {
    // replace any invalid character with a dash character
    const makeValidIdChunk = (chunk) => {
      const invalidChars = /[^$\-_!.a-z0-9]+/g;
      const replaceUpperCaseWithDash = chunk.trim().split(/(?=[A-Z])/).join('-').toLowerCase();
      return replaceUpperCaseWithDash.replace(invalidChars, '-');
    };

    if (!isValidIdChunk(name)) name = makeValidIdChunk(name);
    if (!isValidIdChunk(box)) box = makeValidIdChunk(box);

    return new BitId({ name, box });
  }
}
