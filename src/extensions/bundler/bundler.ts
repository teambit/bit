import { Bundle } from './bundle';

export interface DevServer {
  start();
}

export interface Bundler {
  run(): Promise<Bundle>;
}
