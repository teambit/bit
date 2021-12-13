import { Component } from '@teambit/component';

export interface DevServer {
  start(): void;
}

export type Asset = {
  /**
   * name of the asset.
   */
  name: string;

  /**
   * size of the asset in bytes.
   */
  size: number;
};

export type BundlerResult = {
  /**
   * list of generated assets.
   */
  assets: Asset[];

  /**
   * errors thrown during the bundling process.
   */
  errors: Error[];

  /**
   * warnings thrown during the bundling process.
   */
  warnings: string[];

  /**
   * components included in the bundling process.
   */
  components: Component[];

  /**
   * timestamp in milliseconds when the task started
   */
  startTime?: number;

  /**
   * timestamp in milliseconds when the task ended
   */
  endTime?: number;
};

export interface Bundler {
  run(): Promise<BundlerResult[]>;
}

export type BundlerMode = 'dev' | 'prod';
