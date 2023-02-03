import { Harmony } from './harmony';
import { SlotRegistry } from './slots';

/**
 * type definition for the extension provider function.
 */
export type ProviderFn = (deps: any, config: any, slots: any, harmony: Harmony) => Promise<any>;
