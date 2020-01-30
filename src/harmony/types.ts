import Extension from './extension';
import Harmony from './harmony';

/**
 * type definition for extension of type any. this type is indended for use inside Harmony
 * where extension generics type relevance is low.
 */
export type AnyExtension = Extension<any>;

/**
 * type definition for the extension provider function.
 */
export type ProviderFn<Conf = {}> = (config: Conf, deps: any, harmony: Harmony) => any;
