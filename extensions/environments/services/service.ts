import { Component } from '../../component';

export type EnvContext = {
  components: Component[];
};

export interface Service<TOpts = {}> {
  /**
   * executes a service on a subset of components.
   */
  run(context: EnvContext, options?: TOpts): any;
}
