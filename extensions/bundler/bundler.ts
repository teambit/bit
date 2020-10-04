import { Component } from '@teambit/component';

export interface DevServer {
  start();
}

export type BundlerResult = {
  errors: Error[];
  warnings: string[];
  components: Component[];
};

export interface Bundler {
  run(): Promise<BundlerResult[]>;
}
