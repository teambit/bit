/** @flow */
import loadScope from '../../scope-loader';
import Scope from '../../scope';
import ComponentObjects from '../../component-objects';
import ComponentDependencies from '../../component-dependencies';
import { BitIds } from '../../../bit-id';
import Bit from '../../../consumer/bit-component';
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

  fetch(bitIds: BitIds): Promise<ComponentDependencies[]> {
    return this.getScope().getMany(bitIds)
      .then(bitsMatrix => flatten(bitsMatrix));
  }

  fetchOnes(bitIds: BitIds): Promise<Bit[]> {
    return this.getScope().manyOnes(bitIds);
  }

  connect() {
    return loadScope(this.scopePath).then((scope) => {
      this.scope = scope;
      return this;
    });
  }
}
