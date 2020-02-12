import { Serializable } from 'cleargraph';
import { Extension } from './index';

/**
 * Class extension of type any. this class is indended for use inside Harmony
 * where extension generics type relevance is low.
 */

export class AnyExtension extends Extension<any> implements Serializable {
  toString(): string {
    return JSON.stringify(this.config);
  }
}
