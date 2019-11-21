// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import zlib from 'zlib';

export default function inflate(buffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zlib.inflate(buffer, (err, res) => {
      if (err) return reject(err);
      return resolve(res);
    });
  });
}
