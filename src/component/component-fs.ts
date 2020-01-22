import { MemoryFS } from '@teambit/any-fs';

/**
 * The virtual component filesystem
 */
export default class ComponentFS extends MemoryFS {
  /**
   * hash to represent all contents within this filesystem volume.
   */
  get hash() {
    return '';
  }

  toObject() {}

  toString() {}
}
