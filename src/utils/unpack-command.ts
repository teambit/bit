import zlib from 'zlib';
import { PackData } from './pack-command';

import fromBase64 from './string/from-base64';

export function unpackCommand(str: string, base64 = true): PackData {
  let parsed;
  if (base64) {
    parsed = JSON.parse(fromBase64(str));
  } else {
    parsed = JSON.parse(str);
  }

  if (parsed.headers.compressed) {
    if (parsed.payload) {
      parsed.payload = JSON.parse(zlib.inflateSync(Buffer.from(parsed.payload)).toString());
    }
    if (parsed.headers && parsed.headers.context) {
      parsed.headers.context = JSON.parse(zlib.inflateSync(Buffer.from(parsed.headers.context)).toString());
    }
  }
  return parsed;
}
