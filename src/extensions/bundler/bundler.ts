import { ComponentID } from '../component';

export interface DevServer {
  start();
}

export type BundlerComponentResult = {
  errors: Error[];
  id: ComponentID;
  warnings: string[];
};

export interface Bundler {
  run(): Promise<BundlerComponentResult[]>;
}
