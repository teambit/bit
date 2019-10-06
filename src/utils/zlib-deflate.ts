// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import zlib from 'zlib';

export default function deflate(buffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zlib.deflate(buffer, (err, res) => {
      if (err) return reject(err);
      return resolve(res);
    });
  });
}
