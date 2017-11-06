/** @flow */
import path from 'path';
import decamelize from 'decamelize';
import Version from '../version';
import { InvalidBitId, InvalidIdChunk } from './exceptions';
import { LATEST_BIT_VERSION, VERSION_DELIMITER, NO_PLUGIN_TYPE } from '../constants';
import { isValidIdChunk, isValidScopeName } from '../utils';

export type BitIdProps = {
  scope?: string,
  box?: string,
  name: string,
  version?: ?string
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

  static getValidBitId(box: string, name: string): BitId {
    if (!isValidIdChunk(name)) name = decamelize(name, '-');
    if (!isValidIdChunk(box)) box = decamelize(box, '-');

    return new BitId({ name, box });
  }
}
