import { Component } from '@teambit/component';
import { BuildContext } from '@teambit/builder';

export type Target = {
  /**
   * entries of the target.
   */
  entries: string[] | any;

  /**
   * array of components included in the target.
   */
  components: Component[];

  /**
   * output path of the target
   */
  outputPath: string;

  /**
   * module targets to expose.
   */
  modules?: ModuleTarget[];
};

export type ModuleTarget = {
  /**
   * name of the module.
   */
  name: string;

  /**
   * module exposes.
   */
  exposes: {
    [internalPath: string]: string;
  };

  shared: {
    [key: string]: any;
  };
};

export interface BundlerContext extends BuildContext {
  /**
   * targets for bundling.
   */
  targets: Target[];

  /**
   * list of external packages.
   * TODO: talk through with @gilad.
   */
  externalizePeer?: boolean;

  /**
   * List of peer dependencies
   */
  peers?: string[];

  /**
   * determines whether it is a production build, default is `true`.
   * in development, expect the bundler to favour debugging on the expanse of optimization.
   */
  development?: boolean;

  /**
   * public path output of the bundle.
   */
  publicPath?: string;

  /**
   * root path
   */
  rootPath?: string;

  /**
   * modules for bundle to expose. used by module federation at webpack, or with different methods applied by various bundlers.
   */
  modules?: {
    name: string;
    fileName: string;
    exposes: { [key: string]: string };
  };
}
