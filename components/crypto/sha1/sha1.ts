import * as crypto from 'crypto';

/**
 * encrypt `data` buffer or string into a sha1 hash
 * @example
 * ```js
 *  sha1('foo bar') // => '3773dea65156909838fa6c22825cafe090ff8030'
 * ```
 */
// @ts-ignore todo: fix after deleting teambit.legacy
export function sha1(data: string | Buffer, encoding: crypto.BinaryToTextEncoding = 'hex'): string {
  // @ts-ignore should be fixed after upgrading @types/node from '12.20.4' to > 20.
  return crypto.createHash('sha1').update(data).digest(encoding);
}
