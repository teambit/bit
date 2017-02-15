/** @flow */
import chalk from 'chalk';
import path from 'path';
import InvalidBitInlineId from './exceptions';
import { InvalidIdChunk } from '../../bit-id/exceptions';
import { INLINE_BITS_DIRNAME } from '../../constants';
import { isValidIdChunk } from '../../utils';

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
      if (!isValidIdChunk(name)) {
        throw new InvalidIdChunk(id);
      }
      
      if (!isValidIdChunk(box)) {
        throw new InvalidIdChunk(id);
      }

      return new BitInlineId({
        name,
        box,
      });
    }

    if (splited.length === 1) {
      if (!isValidIdChunk(id)) {
        throw new InvalidIdChunk(id);
      }

      return new BitInlineId({ name: id });
    }

    throw new InvalidBitInlineId();
  }
}
