import { Watch } from '../watch';
import Serve from './serve';

export type ServeConfig = {};

export type ServeDeps = [Watch];

export function provideServe(config: ServeConfig, [watch]: ServeDeps) {
  return new Serve(watch);
}
