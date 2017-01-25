/** @flow */
import { BitId } from '../../bit-id';

export default class ComponentNotFound extends Error {
  id: BitId;
  
  constructor(id: BitId) {
    super();
    this.id = id;
  }
}
