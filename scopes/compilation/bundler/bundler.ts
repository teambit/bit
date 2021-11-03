import { Component } from '@teambit/component';

export interface DevServer {
  start(): void;
}

export type BundlerResult = {
  errors: Error[];
  warnings: string[];
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
