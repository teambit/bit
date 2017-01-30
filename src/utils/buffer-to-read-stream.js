/** @flow */
import * as stream from 'stream';

/**
 * 
 */
export default function bufferToReadStream(buffer: Buffer) {
  const s = new stream.PassThrough();
  s.end(buffer);
  return s;
} 
