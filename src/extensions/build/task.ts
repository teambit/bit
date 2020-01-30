import { Component } from '../component';

export interface Compiler {
  /**
   * compiles given set of components.
   */
  build(components: Component[]);
}
