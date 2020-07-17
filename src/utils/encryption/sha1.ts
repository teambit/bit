import * as crypto from 'crypto';

/**
 * encrypt `data` buffer or string into a sha1 hash
 * @example
 * ```js
 *  sha1('foo bar') // => '3773dea65156909838fa6c22825cafe090ff8030'
 * ```
 */
export default function sha1(data: string | Buffer, encoding: crypto.HexBase64Latin1Encoding = 'hex'): string {
  return crypto.createHash('sha1').update(data).digest(encoding);
}
