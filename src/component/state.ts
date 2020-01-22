import Config from './config';
import ComponentFS from './component-fs';
import { DependencyGraph } from './dependency-graph';

export default class State {
  constructor(
    /**
     * component configuration which is later generated to a component `package.json` and `bit.json`.
     */
    readonly config: Config
  ) {}

  /**
   * in-memory representation of the component current filesystem.
   */
  get filesystem(): ComponentFS {
    return new ComponentFS();
  }

  /**
   * dependency graph of the component current. ideally package dependencies would be also placed here.
   */
  get dependencyGraph() {
    return new DependencyGraph();
  }

  /**
   * calculate the hash of this state
   */
  get hash() {
    return '';
  }
}
