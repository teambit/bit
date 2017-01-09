/** @flow */
import path from 'path';
import InvalidBitInlineId from './exceptions';
import { INLINE_BITS_DIRNAME } from '../../constants';

export type BitInlineIdProps = {
  box?: string;
  name: string;
};

export default class BitInlineId {
  name: string;
  box: string;

  constructor({ box, name }: BitInlineIdProps) {
    this.box = box || 'global';
    this.name = name;
  }
  
  composeBitPath(consumerDir: string): string {
    return path.join(consumerDir, INLINE_BITS_DIRNAME, this.box, this.name);
  }

  toString() {
    const { name, box } = this;
    return [box, name].join('/');
  }

  static parse(id: string): BitInlineId {
    const splited = id.split('/'); 
    if (splited.length === 2) {
      const [box, name] = splited;
      return new BitInlineId({
        name,
        box,
      });
    }

    if (splited.length === 1) {
      return new BitInlineId({ name: id });
    }

    throw new InvalidBitInlineId();
  }
}
