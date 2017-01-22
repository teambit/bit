/** @flow */
import loadScope from '../../scope-loader';
import Scope from '../../scope';
import ComponentObjects from '../../component-objects';
import { BitIds } from '../../../bit-id';
import { FsScopeNotLoaded } from '../exceptions';
import { flatten } from '../../../utils';
import type { ScopeDescriptor } from '../../scope';

export default class Fs {
  scopePath: string;
  scope: ?Scope;

  constructor(scopePath: string) {
    this.scopePath = scopePath;
  }

  close() {
    return this;
  }

  getScope(): Scope {
    if (!this.scope) throw new FsScopeNotLoaded();
    return this.scope;
  }

  describeScope(): Promise<ScopeDescriptor> {
    return Promise.resolve(this.getScope().describe());
  }

  push(componentObjects: ComponentObjects) {
    return this.getScope().export(componentObjects);
  }

  fetch(bitIds: BitIds): Promise<ComponentObjects[]> {
    return this.getScope().getManyObjects(bitIds)
      .then(bitsMatrix => flatten(bitsMatrix));
  }

  fetchAll(ids: BitIds): Promise<ComponentObjects[]> {
    return this.getScope().getManyObjects(ids);
  }

  fetchOnes(bitIds: BitIds): Promise<ComponentObjects[]> {
    return this.getScope().manyOneObjects(bitIds);
  }
  
  list(): Promise<[]> {
    return this.getScope().list();
  }

  connect() {
    return loadScope(this.scopePath).then((scope) => {
      this.scope = scope;
      return this;
    });
  }
}
