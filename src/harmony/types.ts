import { Extension } from './extension';
import Harmony from './harmony';

/**
 * type definition for the extension provider function.
 */
export type ProviderFn<Conf = {}> = (config: Conf, deps: any, harmony: Harmony<unknown>) => Promise<any>;
