import toBase64 from './string/to-base64';

module.exports = function packCmd(obj, base64 = true) {
  if (base64) {
    return toBase64(JSON.stringify(obj));
  }
  return JSON.stringify(obj);
};
