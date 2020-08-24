import zlib from 'zlib';

import fromBase64 from './string/from-base64';

module.exports = function unpackCmd(str, base64 = true) {
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
};
