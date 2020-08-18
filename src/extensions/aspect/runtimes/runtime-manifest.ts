import { RuntimeDefinition } from './runtime-definition';

export interface RuntimeManifest<T> {
  runtime: RuntimeDefinition;
  provider(deps: any): Promise<T>;
}
