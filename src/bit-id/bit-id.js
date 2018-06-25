/** @flow */

// todo: this class has been taken from bit-bin. The class should be exported as a bit component once 'virtualization' changes are done.

import path from 'path';
import { InvalidBitId, InvalidIdChunk } from './exceptions';
import {
  LATEST_VERSION,
  VERSION_DELIMITER,
  LOCAL_SCOPE_NOTATION,
  NO_PLUGIN_TYPE,
  REMOTE_ALIAS_SIGN
} from '../constants';
import { isValidIdChunk, isValidScopeName } from '../utils';

export type BitIdProps = {
  scope?: string,
  box?: string,
  name: string,
  version: string
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

  getScopeWithoutRemoteAnnotation() {
    return this.scope ? this.scope.replace(REMOTE_ALIAS_SIGN, '') : this.scope;
  }

  isLocal(scopeName: string) {
    return this.scope === null || scopeName === this.getScopeWithoutRemoteAnnotation();
  }

  toString(ignoreScope: boolean = false): string {
    const { name, box, version } = this;
    const scope = this.scope;
    const componentStr = ignoreScope || !scope ? [box, name].join('/') : [scope, box, name].join('/');
    if (version && scope) {
      return componentStr.concat(`${VERSION_DELIMITER}${version}`);
    }

    return componentStr;
  }

  toObject() {
    const key = [this.scope, this.box, this.name].join('/');
    const value = this.version;

    return { [key]: value };
  }

  toPath() {
    // todo: change according to the resolve-conflict strategy
    return path.join(this.box, this.name, this.scope, this.version);
  }

  toFullPath() {
    return path.join(this.box, this.name, this.scope, this.version);
  }

  static parse(id: ?string, realScopeName: ?string, version: string = LATEST_VERSION): ?BitId {
    if (!id || id === NO_PLUGIN_TYPE) {
      return null;
    }
    if (id.includes(VERSION_DELIMITER)) {
      const [newId, newVersion] = id.split(VERSION_DELIMITER);
      id = newId;
      version = newVersion;
    }

    const splited = id.split('/');
    if (splited.length === 3) {
      const [scope, box, name] = splited;
      if (scope === LOCAL_SCOPE_NOTATION && !realScopeName) {
        throw new Error('real scope name is required in bitId.parse with @this notation');
      }
      const digestScopeName = scope === LOCAL_SCOPE_NOTATION ? realScopeName : scope;
      if (!isValidIdChunk(name) || !isValidIdChunk(box) || !isValidScopeName(digestScopeName)) {
        // $FlowFixMe
        throw new InvalidIdChunk(`${digestScopeName}/${box}/${name}`);
      }
      // $FlowFixMe (in this case the realScopeName is not null)
      return new BitId({
        scope: digestScopeName,
        box,
        name,
        version
      });
    }

    if (splited.length === 2) {
      const [box, name] = splited;
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

    if (splited.length === 1) {
      const [name] = splited;
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
}
