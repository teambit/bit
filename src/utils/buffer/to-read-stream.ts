import * as stream from 'stream';

/**
 * cast a buffer to a read stream
 */
export default function bufferToReadStream(buffer: Buffer) {
  const s = new stream.PassThrough();
  s.end(buffer);
  return s;
}
