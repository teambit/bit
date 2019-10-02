import fromBase64 from './string/from-base64';

module.exports = function unpackCmd(str, base64 = true) {
  if (base64) {
    return JSON.parse(fromBase64(str));
  }
  return JSON.parse(str);
};
