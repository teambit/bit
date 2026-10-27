import { promisify } from 'util';
import zlib from 'zlib';

export default async function deflate(buffer: Buffer, filePath?: string): Promise<Buffer> {
  const deflateP = promisify(zlib.deflate);
  try {
    return await deflateP(buffer);
  } catch (err: any) {
    const filePathStr = filePath ? ` of "${filePath}"` : '';
    throw new Error(`fatal: zlib.deflate${filePathStr} has failed with an error: "${err.message}"`);
  }
}
