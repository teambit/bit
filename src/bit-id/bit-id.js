/** @flow */
import path from 'path';
import Version from '../version';
import { InvalidBitId, InvalidIdChunk } from './exceptions';
import {
  LATEST_BIT_VERSION,
  VERSION_DELIMITER,
  LOCAL_SCOPE_NOTATION,
  NO_PLUGIN_TYPE,
  REMOTE_ALIAS_SIGN,
} from '../constants';
import { contains, isValidIdChunk, isValidScopeName } from '../utils';

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

  getScopeWithoutRemoteAnnotation() {
    return this.scope.replace(REMOTE_ALIAS_SIGN, '');
  }

  isLocal(scopeName: string) {
    return scopeName === null || scopeName === this.getScopeWithoutRemoteAnnotation();
  }

  getVersion() {
    return Version.parse(this.version);
  }

  toString(ignoreScope: boolean = false): string {
    const { name, box, version } = this;
    const scope = this.scope;
    const componentStr = ignoreScope || !scope ? [box, name].join('/') : [scope, box, name].join('/');
    if (version) {
      return componentStr.concat(`::${version}`);
    }

    return componentStr;
  }

  toObject() {
    const key = [this.scope, this.box, this.name].join('/');
    const value = this.version;

    return { [key]: value };
  }

  toPath() {
    // return path.join(this.box, this.name, this.scope, this.version);
    return path.join(this.box, this.name); // todo: change according to the resolve-conflict strategy
  }

  static parse(id: ?string, realScopeName: ?string, version: string = LATEST_BIT_VERSION): ?BitId {
    if (!id || id === NO_PLUGIN_TYPE) { return null; }
    if (contains(id, VERSION_DELIMITER)) {
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
      // todo: are we good with this decision?
      // We won't be able to use an empty box for a remote scope anymore.
      // On the other hand, if we keep the old logic of [scope, name].
      // How do we know if it's a scope or box?
      // (before removing the inline-components, we required to specify the scope)
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
