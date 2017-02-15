/** @flow */
import { BitId } from '../../bit-id';

export default class ComponentNotFound extends Error {
  id: BitId;
  code: number;
  
  constructor(id: BitId) {
    super();
    this.code = 127;
    this.id = id;
  }
}
