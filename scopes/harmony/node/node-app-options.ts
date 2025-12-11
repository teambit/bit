import type { DeployFn, AppBuildResult } from '@teambit/application';

export interface DeployContext extends AppBuildResult {
  metadata: NodeAppMetadata;

  /**
   * @todo: remove this. it's already part of `metadata`.
   * it's here only for backward compatibility.
   */
  mainFile?: string;
}

export interface NodeAppMetadata {
  /**
   * the main file of the app e.g: dist/app.js
   */
  mainFile: string;

  /**
   * the directory where the artifacts are saved.
   */
  artifactsDir: string;
}

export type NodeAppOptions = {
  /**
   * name of the application.
   */
  name: string;

  /**
   * path to entry file of the application.
   * e.g: '/index.js'
   */
  entry: string;

  /**
   * ranges of ports to use to run the app server.
   */
  portRange?: number[];

  /**
   * deploy function.
   */
  deploy?: DeployFn;
};
