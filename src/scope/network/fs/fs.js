/** @flow */
import loadScope from '../../scope-loader';
import Scope from '../../scope';
import ComponentObjects from '../../component-objects';
import { BitIds, BitId } from '../../../bit-id';
import { FsScopeNotLoaded } from '../exceptions';
import { flatten } from '../../../utils';
import type { ScopeDescriptor } from '../../scope';
import { searchAdapter } from '../../../search';
import type { Network } from '../network';

export default class Fs implements Network {
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

  push(componentObjects: ComponentObjects): Promise<ComponentObjects> {
    return this.pushMany([componentObjects]);
  }

  pushMany(components: ComponentObjects[]): Promise<ComponentObjects[]> {
    const scope = this.getScope();
    return scope.exportManyBareScope(components);
  }
  deleteMany(bitIds: Array<BitId>, force: boolean): Promise<ComponentObjects[]> {
    const scope = this.getScope();
    return scope.removeMany(bitIds, force);
  }
  deprecateMany(bitIds: Array<BitId>): Promise<ComponentObjects[]> {
    const scope = this.getScope();
    return scope.deprecateMany(bitIds);
  }
  fetch(bitIds: BitIds, noDependencies: boolean = false): Promise<ComponentObjects[]> {
    if (noDependencies) return this.getScope().manyOneObjects(bitIds);
    return this.getScope()
      .getObjects(bitIds)
      .then(bitsMatrix => flatten(bitsMatrix));
  }

  fetchAll(ids: BitIds): Promise<ComponentObjects[]> {
    return this.getScope().getObjects(ids);
  }

  latestVersions(componentIds: BitId[]) {
    return this.getScope().latestVersions(componentIds);
  }

  list(): Promise<[]> {
    return this.getScope().listStage();
  }

  search(query: string, reindex: boolean): Promise<[]> {
    return searchAdapter.scopeSearch(this.scopePath, query, reindex);
  }

  show(bitId: BitId): Promise<> {
    return this.getScope().loadComponent(bitId);
  }

  connect() {
    return loadScope(this.scopePath).then((scope) => {
      this.scope = scope;
      return this;
    });
  }
}
