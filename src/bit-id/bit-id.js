/** @flow */
import Version from '../version';
import { InvalidBitId, InvalidIdChunk } from './exceptions';
import { 
  LATEST_BIT_VERSION,
  VERSION_DELIMITER,
  LOCAL_SCOPE_NOTATION,
  NO_PLUGIN_TYPE,
  REMOTE_ALIAS_SIGN,
} from '../constants';
import { contains, isValidIdChunk } from '../utils';

export type BitIdProps = {
  scope: string;  
  box?: string;
  name: string;
  version: string;
};

export default class BitId {
  name: string;
  box: string;
  version: string;
  scope: string;

  constructor({ scope, box, name, version }: BitIdProps) {
    this.scope = scope;
    this.box = box || 'global';
    this.name = name;
    this.version = version;
  }

  changeScope(newScope: string) {
    this.scope = newScope;
    return this;
  }

  getScopeWithoutRemoteAnnotaion() {
    return this.scope.replace(REMOTE_ALIAS_SIGN, '');
  }

  isLocal(scopeName: string) {
    return scopeName === this.getScopeWithoutRemoteAnnotaion();
  }

  getVersion() {
    return Version.parse(this.version);
  }

  toString(ignoreScope: boolean = false): string {
    const { name, box, version } = this;
    const scope = this.scope;

    if (ignoreScope) return [box, name].join('/').concat(`::${version}`);
    return [scope, box, name].join('/').concat(`::${version}`);
  }

  toObject() {
    const key = [this.scope, this.box, this.name].join('/');
    const value = this.version;

    return { [key]: value };
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
      if (!isValidIdChunk(name) || !isValidIdChunk(box) || !isValidIdChunk(digestScopeName)) {
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
      const [scope, name] = splited;
      if (scope === LOCAL_SCOPE_NOTATION && !realScopeName) {
        throw new Error('real scope name is required in bitId.parse with @this notation');
      }
      const digestScopeName = scope === LOCAL_SCOPE_NOTATION ? realScopeName : scope;
      if (!isValidIdChunk(name) || !isValidIdChunk(digestScopeName)) {
        // $FlowFixMe
        throw new InvalidIdChunk(`${digestScopeName}/${name}`);
      }
      // $FlowFixMe (in this case the realScopeName is not null)
      return new BitId({
        scope: digestScopeName,
        name,
        version
      });
    }

    throw new InvalidBitId();
  }
}
