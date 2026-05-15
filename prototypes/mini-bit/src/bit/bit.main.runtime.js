import { BitAspect } from './bit.aspect.js';

export class BitMain {
  static id = BitAspect.id;
  static dependencies = [];
  static slots = [];
  static async provider() { return new BitMain(); }
}
