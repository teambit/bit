/** @flow */
import * as stream from 'stream';

export default function bufferToReadStream(buffer: Buffer) {
  return new stream.PassThrough().end(buffer);
} 
