/** @flow */

import { BitIds, BitId } from '../../bit-id';
import type { InvalidComponent } from '../../consumer/component/consumer-component';
import { ComponentWithDependencies, Scope } from '../../scope';
import type { ScopeDescriptor } from '../../scope';
import DependencyGraph from '../../scope/graph/graph';
import { BitRawObject } from '../../scope/objects';

export type StoreProps = {
  scope: Scope,
  storePath: string
};

// export type RemoteDescriptor = {
//   name: string,
//   host: string,
//   primary: boolean
// };

// export type RemotesDescriptor = Array<RemoteDescriptor>
type RemoteHost = string;
export type RemotesDescriptor = { [remoteName: string]: RemoteHost };

export default class Store {
  __scope: Scope;
  storePath: string;

  constructor(props: StoreProps) {
    this.__scope = props.scope;
    this.storePath = props.storePath;
  }

  static async load(scope: Scope): Promise<?Store> {
    const props = {};
    props.scope = scope;
    props.storePath = scope.path;
    return new Store(props);
  }

  describe(): ScopeDescriptor {
    return this.__scope.describe();
  }

  async readFile(fileId: string): Promise<string> {
    const object = await this.__scope.getRawObject(fileId);
    return object.content.toString();
  }

  async describeRemotes(): Promise<RemotesDescriptor> {
    const remotes = this.__scope.remotes.toPlainObject();
    return remotes;
  }

  async getDependencyGraph(): Promise<DependencyGraph> {
    // TODO: change the nodes values to be the new components format
    return this.__scope.getDependencyGraph();
  }

  async list(): Promise<ModelComponent> {
    // TODO: change the nodes values to be the new components format
    return this.__scope.list();
  }

  async getModelComponentIfExist(id: BitId): Promise<?ModelComponent> {
    return this.__scope.getModelComponentIfExist(id);
  }

  /**
   * findDependentBits
   * foreach component in array find the component that uses that component
   */
  async findDependentBits(bitIds: BitIds, returnResultsWithVersion: boolean = false): Promise<{ [string]: BitId[] }> {
    return this.__scope.findDependentBits(bitIds, returnResultsWithVersion);
  }

  /**
   * Get a path to the folder contains the extension components
   */
  getExtensionsRootPath(): string {
    return this.__scope.getComponentsPath();
  }

  async installExtension(args: {
    ids: [{ componentId: BitId, type?: string }],
    dependentId: BitId,
    verbose?: boolean,
    dontPrintEnvMsg?: boolean
  }): Promise<ComponentWithDependencies[]> {
    // TODO: remove the dependentId, it's necessary only for error
    // We might install extension inside extension without a depId
    return this.__scope.installEnvironment(args);
  }

  // TODO: APIs to consider
  // async importMany(ids[]: ComponentId, cache: boolean = true): Promise<Component[]> {}
  // async addFile(content: string): string {}
}
