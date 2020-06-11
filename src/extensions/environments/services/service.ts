import { Workspace } from '../../workspace';
import { Component } from '../../component';

export type EnvContext = {
  workspace: Workspace;
  components: Component[];
};

export interface Service {
  /**
   * executes a service on a subset of components.
   */
  run(context: EnvContext): any;
}
