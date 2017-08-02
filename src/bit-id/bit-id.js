/** @flow */
import path from 'path';
import Version from '../version';
import { InvalidBitId, InvalidIdChunk } from './exceptions';
import {
  LATEST_BIT_VERSION,
  VERSION_DELIMITER,
  LOCAL_SCOPE_NOTATION,
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
    return componentStr.concat(`::${version}`);
  }

  toObject() {
    const key = this.scope ? [this.scope, this.box, this.name].join('/') : [this.box, this.name].join('/');;
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

  /**
   * Transfer the bit id to a format suitable for dependecny entery in the bit.json
   * something like this:
   * {
   * "bit.utils/object/foreach": "1"
   * }
   *
   * @returns
   * @memberof BitId
   */
  toDependencyEntry() {
    return {
      [path.join(this.box, this.name, this.scope)] : this.version
    }
  }

  static parse(id: ?string, realScopeName: ?string, version: string = LATEST_BIT_VERSION): ?BitId {
    if (!id || id === NO_PLUGIN_TYPE) { return null; }
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
