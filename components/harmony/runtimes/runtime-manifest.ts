import { RuntimeDefinition } from './runtime-definition';
import { ProviderFn } from '../types';
import { Aspect } from '../aspect';
import { SlotProvider } from '../slots';

export interface RuntimeManifest {
  runtime: RuntimeDefinition | string;
  provider: ProviderFn;
  dependencies?: Aspect[];
  slots?: SlotProvider<unknown>[];
  defaultConfig?: { [key: string]: any };
}
