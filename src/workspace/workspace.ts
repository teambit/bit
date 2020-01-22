import { Consumer } from '../consumer';
import { Scope } from '../scope';
import { BitIds } from 'bit-id';
import { Graph } from '../graph/graph';
import { buildGraph } from './graph-builder';

/**
 * API of the Bit Workspace
 */
export default class Workspace {
  // TODO: add a concrete graph types
  _graph?: Graph<any, any>;

  constructor(
    /**
     * private access to the legacy consumer instance.
     */
    private consumer: Consumer,

    /**
     * access to the Workspace's `Scope` instance
     */
    readonly scope: Scope = consumer.scope
  ) {}

  get config() {
    return this.consumer.config;
  }

  get path() {
    return this.consumer.getPath();
  }

  /**
   * This should be removed
   * TODO: temp until we expose all needed functionalities
   * @readonly
   * @memberof Workspace
   */
  get _consumer() {
    return this.consumer;
  }

  // TODO: add a concrete graph types
  async getGraph(): Promise<Graph<any, any>> {
    if (this._graph) {
      return this._graph;
    }
    this._graph = await buildGraph(this.consumer);
    return this._graph;
  }

  loadComponentsForCapsule(ids: BitIds) {
    return this.consumer.loadComponentsForCapsule(ids);
  }
}
